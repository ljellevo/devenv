# Devenv

A macOS menu bar app for starting, stopping, and switching entire local development projects. Electron + React + shadcn/ui. Services are ordinary shell commands; Node, Python, Ollama, Docker, and other tools use the same lifecycle.

## Run

Requires macOS and Node 22.12+ (Node 24 recommended).

```sh
npm install
npm start
```

For renderer development with hot reload: `npm run dev`. Restart this command after changing main-process or supervisor code. Build a locally installable app with `npm run package`; the output is under `release/mac-arm64/Devenv.app` on Apple Silicon (or `release/mac/Devenv.app` on Intel). Drag it into Applications. `npm run dist` builds DMGs. Local builds use ad-hoc signing, matching Oppskriftsbanken; public distribution with Developer ID/notarization is not configured.

The app icon and menu bar glyph come from `build/icon.svg` and `build/tray.svg`. After editing either one, run `npm run icons` to regenerate `build/icon.icns`, `build/icon.png`, and the tray PNGs in `src/main`.

## Daily use

1. Put a `devenv.toml` in a project root or its `resources` folder.
2. Add a search folder in Devenv, for example `~/Documents/code`. Nested configurations are discovered automatically; large dependency and build folders are excluded.
3. Select a project and click **Run project**. Running another project stops the first before starting the second.
4. Read logs in the app or choose **Open in Ghostty** for one viewer tab per enabled service.

Hover at the left edge to reveal the project sidebar, or press **⌘K** to open the command menu. The menu can add a project, select an existing one, add a search folder, or open Help and Settings. **Add a project** asks for a folder, writes an empty `devenv.toml`, and shows a copyable prompt for an agent to configure it. You can also close the prompt and fill out the Config tab yourself. Devenv never overwrites an existing file. The [in-app user guide](docs/user-guide.md) covers the full workflow.

Each service row also has **Start**, **Stop**, or **Retry**. Starting a service starts any missing dependencies; stopping one stops its active dependents first. Independent services keep running. **Start remaining** fills in a partial session, and stopping its last service ends the session.

The **Finder** button reveals the selected project's `devenv.toml`, and **Terminal** opens a new Ghostty window in that file's folder. Both work without starting a session.

Closing a log tab does not stop its service. Closing Devenv's window keeps it in the menu bar. **Quit Devenv** stops the session before exiting. A shutdown failure leaves the app available to show the error and retry Stop.

New nested folders are discovered on app focus or Refresh. Existing config directories and search roots are watched without recursively watching dependency trees. Config changes apply next session; the active session keeps the commands it originally started with.

Use the **Config** tab to edit the selected `devenv.toml` directly in the built-in Monaco editor. Devenv validates changes before saving, uses ⌘S as a shortcut, preserves edits while changing tabs, and asks before discarding unsaved edits when switching projects. If another tool changes the file, reload it before saving. **Services**, **Terminal**, and **Install** are the other tabs; clicking a service opens its filtered output in Terminal, where **Open in Ghostty** opens external tabs for the session. Switch between light and dark appearance in Settings. The macOS window uses a translucent, blurred background; the Terminal tab stays dark in either mode. The config editor uses a Nord palette matched to the app appearance. Devenv reads terminal accent colors from the literal `PROMPT` assignment in `~/.zshrc` (falling back to green and violet); it never executes the file.

The [Mekle 2.0 example](examples/mekle-2.0.toml) is ready to place at the root of `mekle-2.0` as `devenv.toml`.

## Install a cloned project

Add an optional `[install]` recipe to `devenv.toml` for dependencies or setup commands. New clones with a recipe show **Install project**. Installation runs steps in order in an interactive in-app terminal, so you can answer CLI prompts. Devenv stops another active project first. A successful install changes the action to **Run project**; running is a separate click. Failed installs offer **Retry failed step** and **Restart all steps**, while the project menu offers **Reinstall project**. Devenv records progress in `.devenv/install.json` beside the TOML and adds `.devenv/` to the local `.gitignore`.

```toml
[install]
cwd = "."
check_command = "test -d node_modules"

[[install.steps]]
id = "dependencies"
command = "npm install"
timeout = 1800
interactive = true
notes = "Answer any package manager prompts in the Install tab."
```

The optional `check_command` is a read-only command that exits zero when dependencies are present. It runs when you click Install or Run, never during discovery. If it passes on a fresh clone, Devenv records installation without running steps. If it fails on Run, no services start. Without a check, the local record determines installation status. Each step supports `id`, `command`, `cwd`, `env`, `env_file`, `timeout`, `interactive`, and `notes`; paths are relative to the TOML file. Changing executable recipe fields invalidates the record. Projects without `[install]` continue to run directly.

## Configure services

```toml
version = 1
name = "My project"

[services.api]
cwd = "./api"
command = "npm run dev"
ports = [3100]
ready_command = "curl --fail --silent http://127.0.0.1:3100/health"

[services.web]
cwd = "./web"
command = "npm run dev"
ports = [3000]
depends_on = ["api"]
```

Paths are relative to the **TOML file**, including `env_file`. Commands run in `cwd` using the configured shell. Devenv reads the login shell environment once to find tools installed through Homebrew or a version manager. The service itself runs as a noninteractive shell. Environment precedence is service `env` → `env_file` → login environment; applications may also load their own `.env` files normally. Devenv does not load a `.env` implicitly.

| Field | Default | Meaning |
| --- | --- | --- |
| `command` | required | Shell command to start the service |
| `cwd` | `.` | Working directory relative to this TOML |
| `ports` | `[]` | TCP ports to reclaim before startup |
| `depends_on` | `[]` | Service names which must be running/ready or tasks completed |
| `mode` | `process` | `process`, `task`, or `background` |
| `ready_command` | none | Exit zero when ready; retried until the startup deadline |
| `stop_command` | none | Explicit cleanup command; required for background services |
| `logs_command` | none | Foreground log follower for a detached/background service |
| `startup_timeout` | `60` | Seconds for a task, background startup, or readiness |
| `stop_timeout` | `15` | Seconds for each cleanup command/process group before escalation |
| `enabled` | `true` | Whether this service is included |
| `allow_successful_exit` | `false` | Treat a foreground exit with code zero as completed |
| `env` | `{}` | Environment variables for all commands of this service |
| `env_file` | none | Explicit dotenv file; it must exist |

`process` commands must remain in the foreground. Devenv captures stdout/stderr and stops their whole process group, including ordinary child watchers. `task` commands finish successfully before dependants start. `background` commands exit after starting an external resource: both `ready_command` and `stop_command` are required, and `logs_command` should follow its logs. A program that deliberately daemonizes/creates a new session must use explicit cleanup; arbitrary escaped daemons cannot be tracked as ordinary process-group children.

Readiness commands should be short, read-only checks. Each attempt is limited to five seconds and is also checked every five seconds once running. A failing runtime check marks the service failed; restart it manually after resolving the cause. Without a readiness check the status is **Running**, not **Ready**. Dependencies gate startup, not runtime crash cascades.

Output is language agnostic, but applications control their own buffering. Use an unbuffered command (for example `python -u`) or an appropriate service environment variable if output arrives late. Commands receive no interactive stdin; Ghostty tabs are read-only log viewers, not service terminals.

### Ports and cleanup

Switching keeps existing application ports and stops the old project first. Devenv automatically stops external Docker containers or host process groups occupying declared TCP ports. Changes are listed in the session logs. It refuses groups containing an interactive shell, its own ancestors, or infrastructure such as Docker Desktop; those conflicts need manual resolution. Containers are matched by actual **published host ports**, not their internal port numbers.

Keep `ports` synchronized with application configuration. Devenv neither rewrites environment files nor remaps ports. Undeclared ports, file locks, remote services, and intentionally daemonized processes are not automatically isolated.

A startup failure rolls back what that attempt started. It does not restart previously stopped projects or external processes, undo migrations, or delete database volumes. A later failure keeps other services running with a degraded status. Stop/quit works in reverse dependency order and escalates from SIGTERM to SIGKILL after the configured grace period.

## Intivo and Dealroom

The supplied files are designed for the existing sibling layouts:

```sh
cp examples/intivo.toml ../intivo/resources/devenv.toml
cp examples/dealroom.toml ../dealroom/resources/devenv.toml
```

Then add the parent folder to Devenv. Existing package dependencies, `.env` files, Docker, and initial database setup must already be prepared as described by those projects.

- **Intivo:** Postgres, document conversion, Ollama wrapper, migration task, API, web, admin, and homepage. Stripe forwarding is present with `enabled = false`; enable it after installing/authenticating the Stripe CLI. The Ollama wrapper retains its existing model download/preload behavior and external-server reuse. If it reuses Ollama, that server is not claimed or stopped by Devenv. It is shown as Running without waiting for model warm-up; the wrapper's logs show when model preparation finishes. Mock inference may complete immediately.
- **Dealroom:** Postgres, Redis, conversion, auth, storage, payment, API, app, admin, and homepage. Installation and migrations remain manual. Compose services preserve their existing project names and volumes.

Use Devenv instead of the old `resources/dev.sh` scripts for daily startup. Those scripts have independent reclamation logic and cannot share ownership with Devenv.

## Updates and releases

Like Oppskriftsbanken, Devenv checks GitHub Releases and offers a matching DMG for assisted installation. The default repository is **ljellevo/devenv**. Packaged apps check four seconds after launch and every three hours while running. They also check on focus or wake if the three-hour interval has elapsed. Settings shows the last check time, and Settings and the menu bar offer a manual check. An available release appears in the app, and installation still requires confirmation.

Public releases work without a token. For a private repository, save a fine-grained GitHub token with read-only **Contents** permission in Settings → Updates. Tokens are stored in a local mode-0600 file rather than Keychain, avoiding repeated Keychain prompts across ad-hoc signed builds. Tokens are never returned to the renderer, logged, or forwarded to asset download hosts. Empty input + Clear removes the saved token.

**Download & install** asks for confirmation, downloads and verifies the asset size and GitHub SHA-256 digest when supplied, stops the active session, opens the DMG, and quits. Drag the new version into Applications. This is the same assisted flow as Oppskriftsbanken, not a silent in-place replacement.

The Release workflow builds arm64 and x64 DMG/ZIP installers. Pushes to `main` increment the latest stable patch tag; manual runs accept a version. The version is applied to the package before building, so the app and release agree. Publishing occurs only when the workflow runs in GitHub; local builds never publish.

## Data and recovery

Settings, session journal, updater token, and logs live in `~/Library/Application Support/Devenv/`. Projects stay where they are. Logs are local and may contain anything your commands print; secrets are not automatically redacted. Each service retains two rotating files and the latest ten sessions are kept within the disk budget.

The supervisor remains alive long enough to clean up after the Electron parent disconnects. A journal allows the next launch to stop resources left by a crash; PIDs are checked against start times and process groups. Ambiguous ownership blocks recovery rather than signalling an unrelated process. A machine power loss cannot run shutdown commands; recovery happens on the next launch. Never remove a recovery journal merely to hide a failed cleanup.

## Checks

```sh
npm test                 # real fixture subprocesses; deterministic OS-inspection boundary
npm run test:system      # real macOS process inspection, outside restrictive tool sandboxes
npm run typecheck
npm run build
npm run test:ui          # Playwright; install Chromium first if needed
```

Tests never start Intivo or Dealroom, migrate their databases, or reclaim their existing ports. Perform the real-project smoke check on a prepared machine: start Intivo, inspect every service, switch to Dealroom and back, confirm old ports are released and database data remains, then test quit and Ghostty tabs. See [verification notes](docs/verification.md) for the checks performed during implementation.

## Code layout

- `src/core`: configuration, discovery, process supervision, reclamation, logging, recovery, updater.
- `src/main`: Electron lifecycle, tray, validated IPC, Ghostty automation, preload bridge.
- `src/renderer`: shadcn/ui components and workspace UI; no direct shell or filesystem access.
- `examples`: project TOMLs; `tests`: lifecycle, configuration, updater, and UI checks.

The public API is the versioned TOML schema. GUI and tray share an internal supervisor protocol. There is no public CLI in this release.
