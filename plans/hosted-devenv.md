# Devenv Remote: hosted cloud dev environments + agents + build hand-back

## Context

Devenv today is a macOS menu-bar app: discover `devenv.toml` projects, run an `[install]` recipe, start/stop services, show logs. The goal is to investigate (and plan) turning it into a **cloud development environment** where:

1. Installing and starting a project's environment remotely is as easy as it is locally ("`devenv up <repo>`").
2. AI agents can work inside those remote environments (and run in parallel).
3. Any IDE (VS Code, Cursor, JetBrains, Zed) can connect to the remote environment.
4. Build outputs produced remotely come back to the local machine cleanly: only declared outputs, versioned, verified. No syncing the whole workspace.

This document is a pick-up-later plan. Nothing here has been implemented.

### Feasibility verdict: yes, and the codebase is already halfway there

- **Engine is already headless.** `src/core/supervisor.ts` runs as an Electron-free Node child process (forked with `ELECTRON_RUN_AS_NODE`, `src/main/main.ts:280`). It speaks a small JSON request/event protocol: methods `start, start-service, start-one, start-all, stop, stop-one, restart, install, install-input, install-resize, install-cancel, logs, log-directory, shell`; events `ready, fatal, state, log, install-state, install-output` (`supervisor.ts:27-59`). Swap `process.send` for an authenticated socket and it becomes a remote daemon.
- **Nothing in `src/core` imports Electron.** All macOS/UI code (tray, osascript, dialogs, updater) lives in `src/main`.
- **Logs are already resumable.** `src/core/logs.ts` assigns a `seq` to each chunk and writes per-service `.jsonl` files, so a remote client can reconnect with "give me everything after seq N".
- **Interactive install already streams.** `src/core/installer.ts` runs steps in node-pty. Input and resize are already plain messages.
- **Per-platform commands are already being added.** In the uncommitted WIP, `src/core/config.ts` `resolveCommand` lets a command be a `{macos, linux, windows, default}` table, `src/core/platform.ts` adds `commandArgs` and `defaultShell`, and `docs/help/wsl.md` sketches a "companion supervisor". A remote Linux daemon is the same shape as that WSL companion.
- **`recipeHash` is a ready-made cache key.** It lives in `src/core/install-record.ts:7` and can key prebuild snapshots ("this recipe was already installed, so boot from that snapshot").

**Blockers (all small and local):**
- `src/core/process.ts:38` hard-codes macOS `/bin/ps ... lstart=` with a BSD date parse.
- `src/core/ports.ts:7` hard-codes `/usr/sbin/lsof`. `MacPorts` protects Docker Desktop, OrbStack and Devenv.app.
- `Engine.configure` re-creates `MacPorts`, dropping any injected `PortController` (`src/core/engine.ts:29`).
- `process.ts:33` doesn't use the new `commandArgs` yet.
- Scan, settings, config read/save and create-project live in `src/main/main.ts:118-209`, not in the supervisor.
- Install output is only a 120 KB string in main (`main.ts:289`): no persistence, no multi-client replay.
- One active session per engine. That's fine if **one workspace = one project** (recommended below).

### Market position (Oct 2026)

- **Gitpod → Ona**, an agent platform, acquired by OpenAI in June 2026. **Daytona** left CDEs for agent sandboxes. **Coder** (self-hosted, Terraform templates) and **DevPod** (client-only, devcontainers, any provider) remain the open CDE options. **Codespaces** is GitHub-bound.
- None of them has a **project-lifecycle layer** like `devenv.toml`: services with readiness, dependency order, port reclaim, an install recipe with resume. None treats **build artifacts as a first-class hand-back**. That is the gap to own.
- **Don't build VM provisioning first.** Start with "bring your own Linux host over SSH" (zero infrastructure), and make devenvd runnable *inside* Coder/DevPod workspaces. A hosted control plane comes last.

## Target architecture

```
 Local machine                                        Remote Linux workspace (1 per project/task)
 ┌──────────────────────────────┐                    ┌──────────────────────────────────────────┐
 │ Devenv desktop app (client)  │                    │ devenvd  (supervisor.ts → network daemon)│
 │  - Local | Remote workspaces │   SSH tunnel        │  - Engine / Installer / Logs (unchanged) │
 │ devenv CLI                   │◄══════════════════►│  - WorkspaceService (scan/config/settings)│
 │  - up/attach/logs/pull/ssh   │  JSON-RPC over WS   │  - ArtifactStore (builds)                │
 │ IDE (VS Code/Cursor/JB/Zed)  │  + port forwards    │  - MCP server (agents)                   │
 │  via ~/.ssh/config entry     │  + sshd for IDEs    │  - sshd (IDE remote servers)             │
 │ ~/Devenv/builds/<proj>/<id>  │◄── artifact pull ───│  - agent runners (Claude Agent SDK, ...) │
 └──────────────────────────────┘                    └──────────────────────────────────────────┘
                     ▲ later: hosted control plane (provision, snapshots, idle-stop, previews, teams)
```

Key decisions:
- **One workspace per project (or per agent task).** This keeps the engine's single-session model intact and gives clean isolation. Port reclaim inside a dedicated VM is safe because there are no foreign processes.
- **SSH is the universal transport.** VS Code Remote-SSH, Cursor, JetBrains Gateway and Zed all speak it. The devenvd API binds to `127.0.0.1` inside the workspace and is reached via SSH port forwarding or `ProxyCommand`, so there's no public API port.
- **Protocol: versioned JSON-RPC 2.0 over WebSocket.** It's a superset of today's supervisor messages. Every event stream carries a `seq`, so clients resume after reconnects. Local mode keeps the Node IPC transport behind the same interface.
- **`devenv.toml` stays the single source of truth.** Add optional sections only; existing files keep working locally.

## Phased plan

### Phase 0: headless Linux core (prerequisite; overlaps the current Linux-port WIP)
- `src/core/process.ts`: make `processes()`/`identity()` portable. On Linux, parse `/proc/<pid>/stat` (start time in clock ticks); keep `/bin/ps` on macOS. Route `launch()`/`runCommand()` through `commandArgs` from `src/core/platform.ts`.
- `src/core/ports.ts`: add `LinuxPorts implements PortController` using `ss -ltnpH` (fallback `/proc/net/tcp{,6}` + `/proc/*/fd`), with Linux-appropriate protected patterns. Pick the implementation in a `portsFor(platform)` factory.
- `src/core/engine.ts:29`: stop `configure()` from discarding an injected `PortController`.
- `scripts/build.mjs`: add a `devenvd` entry (Node 22 CJS bundle) and rebuild `node-pty` for linux-x64/arm64.
- CI: add an `ubuntu-latest` job running `npm test` and `DEVENV_TEST_OS=1` engine tests (`tests/engine.test.ts`).

### Phase 1: `devenvd` daemon + `devenv` CLI (useful locally before any cloud)
- Split `supervisor.ts` into:
  - `src/core/daemon/service.ts`: Engine + Installer + new **WorkspaceService**. Move `scan`/`discover`, settings load/save (zod), `readConfigDocument`/`saveConfigDocument`/`validateProjectText` and `createProjectConfig` here from `main.ts`, reusing `src/core/config.ts`, `config-files.ts` and `project-create.ts` as-is.
  - `src/core/daemon/transport-ipc.ts` (today's behaviour) and `transport-ws.ts` (WebSocket on `127.0.0.1:<port>` or a Unix socket, bearer token from a `0600` file).
- Move the install-output buffer into the daemon: a seq'd ring plus an on-disk `install.log`, so several clients can attach and replay. Also remove the dead `devenv:install-output` preload channel.
- Define the protocol in `src/shared/protocol.ts` (zod schemas). The desktop `DesktopAPI` in `src/shared/types.ts:32` maps 1:1 onto it.
- `devenv` CLI (`src/cli/`): `status`, `up [path]`, `install`, `start/stop/restart [service]`, `logs -f [service] --since <seq>`, `attach` (interactive install PTY), `config validate`. This doubles as the agent-friendly interface.
- `src/main/main.ts`: `rpc()` gets a `Connection` abstraction: a local forked supervisor (today) or a remote daemon. The renderer stays unchanged.

### Phase 2: remote workspaces on a BYO Linux host over SSH
- `devenv remote add user@host [--name]`: SSH in, install or upgrade the matching `devenvd` (versioned like VS Code Server; reuse the asset selection and sha256 checks from `src/core/updater.ts`), start it under a user systemd unit, and store connection details in client settings.
- `devenv up git@github.com:org/repo [--host name]`: clone into the workspace, run the `[install]` recipe (interactive PTY streamed to the client), then start services.
- **Port forwarding:** for every declared `services.*.ports`, open a local listener on the same port, forwarded over SSH. `localhost:3000` just works. Report conflicts instead of reclaiming local ports.
- **IDE connection:** `devenv ssh-config` writes a `Host devenv-<workspace>` block (with a `ProxyCommand devenv tunnel <ws>` for managed hosts later). The desktop app adds "Open in VS Code / Cursor / JetBrains / Zed" buttons that launch `code --remote ssh-remote+devenv-<ws> /path` and equivalents.
- **Desktop app:** the sidebar groups projects by connection (Local / host name). "Open in Terminal" for remote services runs `ssh -t devenv-<ws> devenv logs -f <svc>` instead of `follower.ts` on local files (`src/main/terminals.ts`, `terminal-backends.ts`).
- Optional `[workspace]` section in `devenv.toml`: `image` (or reuse `.devcontainer/devcontainer.json` as the base OS layer), `cpus`, `memory`, `disk`, `idle_timeout`, `forward = ["web"]`. Ignored locally.

### Phase 3: clean build hand-back (artifacts)
- New schema in `src/core/config.ts`:
  ```toml
  [builds.desktop]
  command = "npm run dist"
  cwd = "."
  outputs = ["release/*.dmg", "release/*.zip"]   # globs relative to cwd; only these come back
  depends_on = ["install"]                         # implicit: install must be complete
  platform = "macos"                               # optional: route to a host that can build it
  retention = 10                                   # keep last N builds
  ```
- Daemon **ArtifactStore** (`src/core/artifacts.ts`):
  1. Run the build as a task with its own seq'd logs (reuse `runCommand`/`Logs`).
  2. Collect only the matched outputs into a content-addressed store (`<root>/artifacts/sha256/...`).
  3. Write a manifest: build id, project, git SHA and dirty flag, `recipeHash`, command, start/end time, exit code, files with size and sha256.
- Protocol: `builds.run`, `builds.list`, `builds.get`, and `builds.download` (HTTP range GET over the tunnel, resumable).
- Client: `devenv build <name>` runs and auto-pulls. `devenv pull <name> [--id]` downloads to `~/Devenv/builds/<project>/<name>/<id>/`, verifies each sha256 and writes `manifest.json`. A `latest` symlink is updated atomically. Optional `open = true` reveals or opens the result.
- Desktop: a **Builds** tab next to Services/Terminal/Install/Config, with a list, logs, "Download", "Reveal", and "Copy share link" (Phase 5).
- Optional `watch = true` mode: one-way incremental sync of an output dir to the client (rsync over SSH) for fast iteration, still limited to `outputs`.
- **Platform caveat (important):** Linux workspaces cannot produce signed macOS/iOS builds. `platform = "macos"` builds must go to a macOS remote host (Mac mini / EC2 Mac) or fall back to running locally. Design the routing in from day one, even if only Linux hosts exist at first.

### Phase 4: agents in remote workspaces
- **MCP server in devenvd** (stdio for in-workspace agents; streamable HTTP over the tunnel for local agents):
  - tools: `project_status`, `start_service`, `stop_service`, `restart_service`, `read_logs(service, since_seq, grep)`, `run_install`, `run_build`, `list_builds`, `validate_config`.
  - prompt: `setup_devenv_toml`, reusing `projectSetupPrompt` from `src/shared/project-prompt.ts`.
- **Auto-config:** `devenv up <repo>` on a repo without `devenv.toml` starts an agent that writes one (with the existing prompt), validates it with `validateProjectText`, and asks the user to approve before anything runs. This covers the ROADMAP item (`ROADMAP.md:3`) remotely.
- **Agent tasks:** `devenv agent run "<task>" --repo X --parallel 3` forks N workspaces from the prebuild snapshot. Each runs an agent (Claude Agent SDK / Claude Code headless as the default runner, with the runner pluggable) on its own branch. It reports a branch/PR, a test/build status and artifacts. Humans can `devenv ssh`/open an IDE into any agent workspace to take over.
- Guardrails: per-workspace egress allowlist, scoped secrets (never in logs; mask known values in `Logs.write`), and wall-clock/token budgets with idle-stop.

### Phase 5: hosted control plane (only once Phases 1–4 prove out)
- Workspace API: create/stop/resume/delete/snapshot. Provider adapters: Docker on a host, Hetzner/AWS/GCP VMs, Fly Machines, Firecracker. Optionally ship devenvd as a **Coder template** and a **DevPod provider** so teams can use their existing CDE.
- **Prebuilds:** after a successful install on the default branch, snapshot the disk keyed by `recipeHash` + lockfile hashes, so new workspaces and agent forks boot in seconds.
- **Preview URLs** (`https://<port>--<ws>.<domain>`) with auth, plus shareable signed build download links.
- Auth: device-code login, short-lived tokens, SSO for teams. Also auto-stop on idle and usage metering.
- **Security model update:** `SECURITY.md` currently assumes one trusted local user. Hosted mode needs VM-level isolation per workspace (never shared containers across tenants), a secret store, audit logs, and a clear statement that `devenv.toml` commands run with full workspace privileges.

## Critical files

| Area | Files |
|---|---|
| Portability | `src/core/process.ts`, `src/core/ports.ts`, `src/core/engine.ts`, `src/core/platform.ts`, `scripts/build.mjs` |
| Daemon | `src/core/supervisor.ts` → `src/core/daemon/*`, new `src/shared/protocol.ts` |
| Moved from main | `src/main/main.ts` (scan/settings/config handlers), `src/main/preload.ts`, `src/shared/types.ts` |
| Config schema | `src/core/config.ts` (`[workspace]`, `[builds.*]`), `src/shared/project-prompt.ts` (document new sections) |
| New | `src/cli/*`, `src/core/artifacts.ts`, `src/core/mcp.ts`, `src/renderer/Builds.tsx` |
| Reuse as-is | `logs.ts` (seq/jsonl), `installer.ts` (PTY), `install-record.ts` (`recipeHash`), `config-files.ts` (revisioned save), `updater.ts` (asset download + sha256) |

## Open decisions (defaults assumed above)

1. **Audience:** a solo or self-hosted tool (Phases 0–4) vs. a hosted SaaS (Phase 5). Assumed: self-hosted first.
2. **Workspace substrate:** BYO SSH host first. Then pick one managed provider (Hetzner for cost, or Fly Machines for fast start/stop).
3. **devcontainer.json:** adopt it as the base-image format (recommended, for interop) or keep everything in `devenv.toml`.
4. **Do macOS-target builds matter?** If yes, plan for a macOS build host early.
5. **Default agent runner:** Claude Agent SDK assumed, behind a runner interface.

## Verification (per phase)

- **Phase 0:** `npm test` and `DEVENV_TEST_OS=1 npm run test:system` pass on `ubuntu-latest` CI. Manually run `examples/basic.toml` and `examples/mekle-2.0.toml` via the daemon on a Linux VM, including port reclaim and crash recovery (`session.json` journal).
- **Phase 1:** `devenv up . && devenv logs -f web` works locally without the desktop app. The desktop app works unchanged over the new Connection layer (Playwright `tests/ui/workspace.spec.ts`). A protocol round-trip test covers every method, plus a reconnect-with-seq test.
- **Phase 2:** from a Mac, `devenv remote add` to a fresh Ubuntu VM, then `devenv up <repo>`, answer an interactive install prompt, open `localhost:3000` in a local browser, and open the workspace in VS Code Remote-SSH and JetBrains Gateway via the generated SSH host.
- **Phase 3:** `devenv build web` produces only the declared files locally, with a matching sha256 manifest. An interrupted download resumes. Retention prunes old builds. `node_modules` never crosses the wire.
- **Phase 4:** an agent configures a repo without `devenv.toml` through MCP, the config validates, services start and logs are readable through MCP tools. Three parallel agent workspaces produce three branches.
- **Phase 5:** a workspace cold-boots from a prebuild snapshot in under 30 s, idles to stopped, and resumes with services restarted.

## Next step when picking this up
Start Phase 0 (it also unblocks the in-progress Linux desktop port).
