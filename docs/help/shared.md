# Devenv user guide

Devenv starts, stops, and switches local development projects. Each project has a `devenv.toml` listing its services and the shell commands that run them. One project session is active at a time.

## Find or create projects

On first launch, a short tutorial explains how Devenv works, asks whether you want a light, dark, or system appearance, asks which terminal app and coding agent you use, asks you to choose the folder that contains your projects, and offers to add a project. You can skip it and add search folders later.

Press the **command-menu shortcut** or click the search field in the window header. The command menu lists Create project, Add a project, every discovered project, Add search folder, Help, and Settings. The active project appears first. Selecting a project shows its details; it does not start it.

Choose **Add search folder** to let Devenv find `devenv.toml` in that folder and its subfolders. The scanner skips hidden folders (names starting with `.`, such as `.claude/worktrees`) and common dependency, cache, and build directories such as `node_modules` and `dist`. You can add exclusions in Settings and refresh the project list from the sidebar.

Choose **Add a project** to pick an existing directory. Devenv writes an empty `devenv.toml` there, adds the directory to search folders if needed, and opens a dialog with a prompt you can copy into an agent. Close the dialog to fill out the file yourself in the Config tab. The project appears as a Draft without a validation error and cannot be started until you add valid services. While Config is open, Devenv reloads external file changes automatically if you have no unsaved edits; if you do, it keeps your edits and asks you to reload. An existing `devenv.toml` is never overwritten.

Choose **Create project** in the command menu to start a new project. Pick or create its folder; Devenv adds the folder to search folders unless one already covers it, writes an empty `devenv.toml`, and writes an `AGENTS.md` with a Devenv section. That section tells your coding agent to update `devenv.toml` whenever the project gains or changes an install step, a service, or a run command. If the folder already has an `AGENTS.md`, its content is kept and the section is added at the end. The new project opens in Config as a Draft; open the agent terminal to start building it.

## Navigate and organize

Move the pointer to the left edge of the window to open the sidebar. It overlays the workspace and closes when you leave it. The sidebar shows each project’s running state and enabled service count. Click a project to inspect it.

Create nested folders in the sidebar to organize projects without moving files on disk. Drag projects or folders to change their order or location. The faded row marks the destination while the dragged row follows the pointer. Folder organization persists across scans and app restarts. Search in the sidebar filters project names.

## Install a cloned project

A project may declare optional installation commands. Devenv discovers only folders with `devenv.toml`; it never runs a command during scanning. If the project has an `[install]` recipe and no matching completion record, the header shows **Install project**. Click it to run ordered steps in the Install tab, which lists each step with a spinner while it runs and a checkmark when it finishes. Click **Show terminal** to see the live output, and type into that terminal if a tool asks for input. Each step can include `notes` with setup guidance. Devenv stops the currently running project before executing install commands. After all steps finish, click **Run project** separately.

A failed step leaves completed steps recorded. Choose **Retry failed step** to continue from there, or **Restart all steps** to run the whole recipe again. The project action menu offers **Reinstall project** even after a successful install. **Cancel install** stops the current step. Devenv writes a local installation record under `.devenv/` beside the TOML and adds `.devenv/` to that directory’s `.gitignore`. Removing the record or changing the recipe makes the project eligible for installation again.

If `check_command` is set, Devenv runs it only when you click Install or Run. An existing clone that passes the check is marked installed without running steps. If the check fails when you click Run, the project returns to Install and no services start. Without `check_command`, the local completion record determines installation status. A project without `[install]` runs as before.

The install table supports `cwd` and `check_command`. Each step requires a stable `id` and a shell `command`; optional fields are `cwd`, `env`, `env_file`, `timeout` in seconds, `interactive`, and `notes`. Paths resolve relative to the TOML file. Steps run in order, using the configured shell. Avoid putting secrets in TOML. A step can create service directories or environment files; Devenv validates their existence before Run.

## Run projects and services

**Run project** starts the selected project’s enabled services in dependency order. Running another project stops the current project before starting another. **Stop project** shuts services down in reverse dependency order. Devenv runs configured commands in the chosen shell and supervises their owned processes.

The Services tab lists commands, declared ports, and live status. Each enabled service has Start, Stop, Retry, or Run again as appropriate. Starting one service also starts missing dependencies. Stopping one stops active dependents but leaves independent services running. **Start remaining** fills in a partially running session. A failed service may leave the session degraded while other services keep running.

Declared ports help Devenv find conflicts during a switch. Keep them accurate: Devenv does not rewrite application ports or environment files. Detached services need explicit readiness and stop commands so Devenv can manage them safely.

## Edit `devenv.toml`

Open the **Config** tab to edit the selected project in Monaco. Devenv validates TOML and project rules before saving. Use **Save** or the **save shortcut**; **Reload** rereads the file. If another tool changes the file, reload before saving. Unsaved edits remain while you visit Services or Logs, and Devenv asks before discarding them when you choose another project. Changes to a running project apply the next time its session starts.

A small example:

```toml
version = 1
name = "My project"

[services.api]
cwd = "./api"
command = "npm run dev"
ports = [3100]
```

Paths such as `cwd` and `env_file` are relative to the TOML file. Services can use `process` (a foreground command), `task` (a command that completes), or `background` (an external resource with `ready_command` and `stop_command`). Use `depends_on` for startup order, `ready_command` for health checks, `logs_command` for detached logs, and `env` or `env_file` for service variables. The default mode is `process`, and the default working directory is `.`.

## Logs and external tools

The Logs tab shows captured service output. Choose a service tab or **All**, filter by text, pause or follow new lines, and copy visible logs. Clicking a service opens its logs. External terminal actions run log followers only; closing them does not stop services. The directory action opens the config directory without starting a session.

## Coding agent terminal

The pill in the bottom-right corner opens the agent terminal, and so does pressing **Space** on the selected project (when no text field or button has the key). It is a sheet that slides in from the right and runs your coding agent in an interactive terminal, started in the folder that holds `devenv.toml`. The harness starts the first time you open the sheet. **Minimize**, or a click outside the sheet, hides it without stopping the harness, which keeps running while you visit other projects or stop the project. The pill and the sheet show **Working** while the harness is writing output, **Idle** once it has gone quiet and is waiting for you, and **Exited** when it has ended. **Restart** launches it again and **Stop** ends it. In the terminal, **Shift+Enter** starts a new line without sending the message. On macOS, **⌘⌫** deletes the line back to its start, **⌘⌦** deletes to its end, and **⌘←** and **⌘→** move to either end. Choose Claude Code, Codex, or a custom harness command in General settings. The menu in the sheet picks a different harness for that project only; **Default** returns to the one from Settings. **Custom command…** asks for any other command and adds it to the menu, where other projects can pick it too. A custom command leaves the menu once no project uses it; Claude Code and Codex always stay. A harness that is already running keeps its command until you restart it. The command runs through your shell, so the harness must be installed and on your `PATH`.

## Settings and appearance

General settings hold appearance, terminal selection, the default coding agent, the service shell, and Reset tutorial. Stop active work before changing the shell. Workspace settings manage search folders and exclusions. Updates settings manage the release repository. Appearance and folder changes save immediately.

## Updates

Packaged builds check GitHub Releases after launch and every three hours. Check manually in Settings or the tray. Releases come from a public repository, so no token is needed. Updates verify download size and the release checksum when provided. Active work must stop before installing.

## Platform command overrides

Every command field accepts a string or a map, including service commands, readiness, cleanup, logs, installation checks, and installation steps:

```toml
command = { default = "npm run dev", windows = "npm.cmd run dev" }
```

Supported keys are `macos`, `linux`, `windows`, and `default`. The execution platform takes precedence over `default`; a missing match is an error. WSL uses `linux`. Installation records include resolved commands and execution identity, so changing them requires installation again.

## Troubleshooting and recovery

If a project is missing, check that a search folder contains its `devenv.toml`, then refresh projects. If the config has an error, select that project and open Config to correct it. If startup fails, inspect the Services status and Logs output; verify commands, working directories, environment files, and declared ports.

Devenv keeps a session journal so it can recover and clean up resources after an unexpected exit. A power loss cannot run shutdown commands; cleanup is attempted on the next launch. If a stop fails, Devenv keeps the session visible so you can inspect and retry it. Project files and database volumes are not deleted by ordinary Stop or Switch actions.
