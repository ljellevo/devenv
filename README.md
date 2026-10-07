# Devenv

A desktop and tray app for macOS, Windows, Linux, and WSL 2 for starting, stopping, and switching entire local development projects. Electron + React + shadcn/ui. Services are ordinary shell commands; Node, Python, Ollama, Docker, and other tools use the same lifecycle.

## Installation

Platform support is implemented for macOS, Windows x64, Linux x64, and WSL 2. Native validation is still required before the new packages are release-ready; see [verification](docs/verification.md). Downloadable apps include their own runtime; Node.js is only needed when building from source. Install the runtimes your projects need (such as Node.js, Python, or Docker) separately.

| Operating system | Availability |
| --- | --- |
| macOS, Apple Silicon (M-series) | Use the `arm64.dmg` release asset |
| macOS, Intel | Use the `x64.dmg` release asset |
| Windows x64 | NSIS `.exe`; PowerShell 7 or Windows PowerShell |
| Linux x64 | AppImage or deb; Ubuntu 24.04 is the validation target |
| WSL 2 | Windows app plus a bundled Linux x64 companion; no WSLg required |

### macOS (Apple Silicon and Intel)

1. Open [GitHub Releases](https://github.com/ljellevo/devenv/releases) and select the latest stable release. If no release is available, use the [developer installation](#developer-installation) below.
2. Download `Devenv-<version>-arm64.dmg` for Apple Silicon or `Devenv-<version>-x64.dmg` for Intel. **Apple menu → About This Mac** shows your chip or processor.
3. Open the DMG and drag **Devenv.app** into **Applications**. Eject the disk image, then open Devenv from Applications.
4. Choose a terminal and add the folder containing your projects. macOS may ask permission to control your selected terminal when you first open external logs.

Builds currently use ad-hoc signing and are **not Developer ID signed or notarized**. If macOS blocks an app you trust, try opening it once, then use **System Settings → Privacy & Security → Open Anyway**, if offered. See [Apple’s guidance on opening apps safely](https://support.apple.com/102445). Do not disable Gatekeeper globally.

To update, use **Settings → Updates** or download a newer DMG from Releases. Quit Devenv before replacing the app in Applications.

### Windows

Run `Devenv-<version>-windows-x64.exe` when available in Releases. Choose Windows Terminal for log tabs or PowerShell for separate log windows. Native commands prefer PowerShell 7 and fall back to Windows PowerShell; use compatible command overrides.

For WSL, install WSL 2 and a distribution, then use **Settings → Workspace → Choose WSL folder**. The picker validates directories inside the distribution. UNC folders are detected automatically. Native Windows-drive projects offer a per-project execution selector while stopped. The companion is provisioned under `~/.local/share/devenv/companion/<version>` inside the selected distribution; it includes Node and native PTY dependencies. See [WSL setup](docs/help/wsl-setup.md) and [operations](docs/help/wsl.md).

### Linux

Use `Devenv-<version>-linux-x64.AppImage` or `.deb` when available. Make an AppImage executable before running it; install deb packages with your distribution package installer. System Terminal tries xdg-terminal-exec, x-terminal-emulator, GNOME/KDE terminals, Xfce Terminal, and xterm. Ghostty is also supported. See the [Linux guide](docs/help/linux.md).

## Quick start

Create a `devenv.toml` in the root of a project whose dependencies are already installed:

```toml
version = 1
name = "My app"

[services.web]
command = "npm run dev"
ports = [3000]
```

Replace the command and port with your project's actual values, add its parent folder in Devenv, and click **Run project**. A [generic example](examples/basic.toml) also includes an optional dependency installation recipe.

Only run configurations you trust: service and installation commands execute with your user account's permissions. Declared ports can cause Devenv to stop other processes or Docker containers using those ports; see [Ports and cleanup](#ports-and-cleanup).

## Daily use

1. Put a `devenv.toml` in a project root or its `resources` folder.
2. Add a search folder in Devenv, for example `~/Documents/code`. Nested configurations are discovered automatically; large dependency and build folders are excluded.
3. Select a project and click **Run project**. Running another project stops the first before starting the second.
4. Read logs in the app or choose **Open in Terminal**, **iTerm2**, or **Ghostty** (whichever terminal app you picked) for one viewer tab per enabled service. Terminal opens a window per service, since it cannot be scripted to open tabs.

Hover at the left edge to reveal the project sidebar, or press **⌘K** on macOS or **Ctrl+K** elsewhere to open the command menu. The menu can add a project, select an existing one, add a search folder, or open Help and Settings. **Add a project** asks for a folder, writes an empty `devenv.toml`, and shows a copyable prompt for an agent to configure it. You can also close the prompt and fill out the Config tab yourself. Devenv never overwrites an existing file. The [in-app user guide](docs/user-guide.md) covers the full workflow.

Each service row also has **Start**, **Stop**, or **Retry**. Starting a service starts any missing dependencies; stopping one stops its active dependents first. Independent services keep running. **Start remaining** fills in a partial session, and stopping its last service ends the session.

**Open in Finder / Explorer / File Manager** reveals the selected project's `devenv.toml`, and the **Open in …** button beside it opens a new window of your terminal app in that file's folder. Both work without starting a session. Onboarding asks which terminal app you prefer (options depend on the host platform); change it later in Settings.

Closing a log tab does not stop its service. Closing Devenv's window keeps it in the macOS menu bar or the Windows/Linux system tray (click the tray icon to reopen it). **Quit Devenv** stops the session before exiting. A shutdown failure leaves the app available to show the error and retry Stop.

New nested folders are discovered on app focus or Refresh. Existing config directories and search roots are watched without recursively watching dependency trees. Config changes apply next session; the active session keeps the commands it originally started with.

Use the **Config** tab to edit the selected `devenv.toml` directly in the built-in Monaco editor. Devenv validates changes before saving, uses ⌘S on macOS or Ctrl+S elsewhere, preserves edits while changing tabs, and asks before discarding unsaved edits when switching projects. If another tool changes the file, reload it before saving. **Services**, **Terminal**, and **Install** are the other tabs; clicking a service opens its filtered output in Terminal, where **Open in …** opens external tabs in your terminal app for the session. Switch between light and dark appearance in Settings. The macOS window uses a translucent, blurred background; the Terminal tab stays dark in either mode. The config editor uses a Nord palette matched to the app appearance. Devenv reads terminal accent colors from the literal `PROMPT` assignment in `~/.zshrc` (falling back to green and violet); it never executes the file.

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

Output is language agnostic, but applications control their own buffering. Use an unbuffered command (for example `python -u`) or an appropriate service environment variable if output arrives late. Commands receive no interactive stdin; external terminal tabs are read-only log viewers, not service terminals.

### Ports and cleanup

Switching keeps existing application ports and stops the old project first. Devenv automatically stops external Docker containers or host process groups occupying declared TCP ports. Changes are listed in the session logs. It refuses groups containing an interactive shell, its own ancestors, or infrastructure such as Docker Desktop; those conflicts need manual resolution. Containers are matched by actual **published host ports**, not their internal port numbers.

Keep `ports` synchronized with application configuration. Devenv neither rewrites environment files nor remaps ports. Undeclared ports, file locks, remote services, and intentionally daemonized processes are not automatically isolated.

A startup failure rolls back what that attempt started. It does not restart previously stopped projects or external processes, undo migrations, or delete database volumes. A later failure keeps other services running with a degraded status. Stop/quit works in reverse dependency order and escalates from SIGTERM to SIGKILL after the configured grace period.

### Platform command overrides

Every command field accepts a string or a strict platform map:

```toml
[services.web]
command = { default = "npm run dev", windows = "npm.cmd run dev" }
```

Keys are `macos`, `linux`, `windows`, and `default`; WSL selects `linux`. Missing matches are errors. Windows PowerShell lacks PowerShell 7's `&&` syntax. Commands are resolved before runtime and installation hashes include execution identity. Linux and macOS use process groups; native Windows uses a bundled Job Object helper. Explicit cleanup runs before owned trees are terminated. External Windows port owners must currently be stopped manually; WSL proxies are never reclaimed.

See the [documentation index](docs/README.md) for all platform guides and [verification](docs/verification.md) for release blockers.

## Examples

Start with [basic.toml](examples/basic.toml) and adapt its commands and ports to your project. The [Intivo](examples/intivo.toml), [Dealroom](examples/dealroom.toml), and [Mekle 2.0](examples/mekle-2.0.toml) files illustrate larger setups. They depend on separate project layouts and are not runnable demos included in this repository. Intivo and Dealroom expect the configuration in a `resources` folder; Mekle expects it in the project root.

Review project-specific installation, migration, and cleanup commands before adapting them. In particular, the Mekle example removes its database container on stop. Do not run another development launcher against the same resources while Devenv owns them.

## Updates and releases

Devenv checks GitHub Releases and offers a matching platform, architecture, and package for assisted installation. The default repository is **ljellevo/devenv**. Packaged apps check four seconds after launch and every three hours while running. They also check on focus or wake if the three-hour interval has elapsed. Settings shows the last check time, and Settings and the menu bar offer a manual check. An available release appears in the app, and installation still requires confirmation.

Public releases work without a token. For a private repository, save a fine-grained GitHub token with read-only **Contents** permission in Settings → Updates. Tokens are stored in a local mode-0600 file rather than Keychain, avoiding repeated Keychain prompts across ad-hoc signed builds. Tokens are never returned to the renderer, logged, or forwarded to asset download hosts. Empty input + Clear removes the saved token.

**Download & install** asks for confirmation, downloads and verifies the asset size and GitHub SHA-256 digest when supplied, stops installation and the active session, then opens the DMG, NSIS, or deb installer. On macOS, drag the new version into Applications. AppImages are revealed with instructions to quit, replace the old file, and mark the replacement executable. Installation is assisted; it does not silently replace the running app.

The Release workflow builds macOS arm64/x64 DMG/ZIP, Windows x64 NSIS, and Linux x64 AppImage/deb artifacts. A Linux job builds the companion before Windows packaging. Native test jobs and a prepared WSL 2 runner gate publication. Pushes to `main` increment the latest stable patch tag; manual runs accept a version. The version is applied to the package before building, so the app and release agree. Publishing occurs only when the workflow runs in GitHub; local builds never publish.

## Data and recovery

Host settings, journal, token, and logs live in Electron’s user data directory (`~/Library/Application Support/Devenv/`, `%APPDATA%/Devenv/`, or `$XDG_CONFIG_HOME/Devenv/`). WSL journals and logs live inside each distribution under `~/.local/share/devenv/supervisor/`. WSL installation records have distribution-specific names. Projects stay where they are. Logs are local and may contain anything your commands print; secrets are not automatically redacted. Each service retains two rotating files and the latest ten sessions are kept within the disk budget.

The supervisor remains alive long enough to clean up after the Electron parent disconnects. A journal allows the next launch to stop resources left by a crash; PIDs are checked against start times and process groups. Ambiguous ownership blocks recovery rather than signalling an unrelated process. A machine power loss cannot run shutdown commands; recovery happens on the next launch. Never remove a recovery journal merely to hide a failed cleanup.

## Developer installation

Use **Node.js 24 and npm**, native to the build platform. macOS requires Xcode Command Line Tools, Linux requires a C++ compiler, make, and Python 3, and Windows requires Visual Studio C++ Build Tools and Python 3. Run Windows builds in a developer shell with `cl.exe` on PATH. Get Node.js from the [official download page](https://nodejs.org/en/download). Install Git and the Xcode Command Line Tools if needed:

```sh
xcode-select --install
```

Clone the repository (or your fork), install the locked dependencies, and start the app:

```sh
git clone https://github.com/ljellevo/devenv.git
cd devenv
npm ci
npm start
```

`npm start` builds the app and launches Electron. `npm ci` downloads Electron and installs the native terminal dependency (`node-pty`); allow install scripts to run. If a native dependency must compile locally, you need the platform compiler and Python 3. Windows builds compile the bundled Job Object helper. Windows packaging also requires `dist/companion-linux-x64.tar.gz`: run `npm run build:companion` on Linux x64 after `npm ci`, then copy that artifact into the Windows checkout. Native dependencies must be built on their execution OS.

### Development workflow

```sh
npm run dev
```

This starts Vite and Electron with renderer hot reload. Restart it after changing main-process, preload, or supervisor code. The dev server uses port `4783`.

For a separate development profile, run:

```sh
DEVENV_DATA_DIR="$HOME/Library/Application Support/Devenv Dev" npm run dev
```

The repository's own `devenv.toml` uses that separate profile when launched from an installed Devenv app. Avoid running two instances against the same managed project.

### Checks

```sh
npm test                 # fixture processes with a simulated OS-inspection boundary
npm run typecheck
npm run build
npx playwright install chromium
npm run test:ui          # renderer interaction tests using a mocked desktop bridge
npm run test:system      # native process inspection and fixture lifecycle
```

Run system tests on each native OS with process inspection permitted; restrictive sandboxes can block them. The tests use fixtures and mocks rather than starting the project-specific examples. Before submitting lifecycle changes, also check start, stop, switching, and quit with disposable local services. See [verification notes](docs/verification.md) for historical validation and remaining manual checks.

### Build an installable app

```sh
npm run package
```

The unpacked app is written to the platform directory under `release/`. To build the host platform installers:

```sh
npm run dist
```

Artifacts are written to `release/`. Local builds do not publish releases. Signing is ad-hoc; Developer ID signing and notarization are not configured. The release workflow builds all platform assets and publishes only after native and prepared WSL jobs succeed.

### Icons

Edit `build/icon.svg` or `build/tray.svg`, then run:

```sh
npx playwright install chromium
npm run icons
```

This regenerates the PNG/ICNS assets and requires macOS `iconutil`.

## Code layout

- `src/core`: configuration, discovery, process supervision, reclamation, logging, recovery, updater.
- `src/main`: Electron lifecycle, tray, validated IPC, Terminal, iTerm2, and Ghostty automation, preload bridge.
- `src/renderer`: shadcn/ui components and workspace UI; no direct shell or filesystem access.
- `examples`: project TOMLs; `tests`: lifecycle, configuration, updater, and UI checks.

The public API is the versioned TOML schema. GUI and tray share an internal supervisor protocol. There is no public CLI in this release.

## Contributing

Bug reports and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow and [SECURITY.md](SECURITY.md) for security reporting. Include your host OS, execution target and distribution, CPU architecture, app version, and a minimal reproduction when reporting a bug. Remove tokens, environment values, and private project details from logs.

## License

[MIT](LICENSE). Bundled and adapted components are listed in [third-party notices](THIRD_PARTY_NOTICES.md).
