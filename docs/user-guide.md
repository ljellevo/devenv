# Devenv user guide

Devenv starts, stops, and switches local development projects. Each project has a `devenv.toml` listing its services and the shell commands that run them. One project session is active at a time.

## Find or create projects

On first launch, a short tutorial explains how Devenv works, asks whether you want a light, dark, or system appearance, asks you to choose the folder that contains your projects, and offers to add a project. You can skip it and add search folders later.

Press **⌘K** or click the search field in the window header. The command menu lists Add a project, every discovered project, Add search folder, Help, and Settings. The active project appears first. Selecting a project shows its details; it does not start it.

Choose **Add search folder** to let Devenv find `devenv.toml` in that folder and its subfolders. The scanner skips hidden folders (names starting with `.`, such as `.claude/worktrees`) and common dependency, cache, and build directories such as `node_modules` and `dist`. You can add exclusions in Settings and refresh the project list from the sidebar.

Choose **Add a project** to pick an existing directory. Devenv writes an empty `devenv.toml` there, adds the directory to search folders if needed, and opens a dialog with a prompt you can copy into an agent. Close the dialog to fill out the file yourself in the Config tab. The project appears as a Draft without a validation error and cannot be started until you add valid services. While Config is open, Devenv reloads external file changes automatically if you have no unsaved edits; if you do, it keeps your edits and asks you to reload. An existing `devenv.toml` is never overwritten.

## Navigate and organize

Move the pointer to the left edge of the window to open the sidebar. It overlays the workspace and closes when you leave it. The sidebar shows each project’s running state and enabled service count. Click a project to inspect it.

Create nested folders in the sidebar to organize projects without moving files on disk. Drag projects or folders to change their order or location. The faded row marks the destination while the dragged row follows the pointer. Folder organization persists across scans and app restarts. Search in the sidebar filters project names.

## Install a cloned project

A project may declare optional installation commands. Devenv discovers only folders with `devenv.toml`; it never runs a command during scanning. If the project has an `[install]` recipe and no matching completion record, the header shows **Install project**. Click it to run ordered steps in the interactive Install tab. Type into that terminal if a tool asks for input. Each step can include `notes` with setup guidance. Devenv stops the currently running project before executing install commands. After all steps finish, click **Run project** separately.

A failed step leaves completed steps recorded. Choose **Retry failed step** to continue from there, or **Restart all steps** to run the whole recipe again. The project action menu offers **Reinstall project** even after a successful install. **Cancel install** stops the current step. Devenv writes `.devenv/install.json` beside the TOML and adds `.devenv/` to that directory’s `.gitignore`. Removing the record or changing the recipe makes the project eligible for installation again.

If `check_command` is set, Devenv runs it only when you click Install or Run. An existing clone that passes the check is marked installed without running steps. If the check fails when you click Run, the project returns to Install and no services start. Without `check_command`, the local completion record determines installation status. A project without `[install]` runs as before.

Example:

```toml
[install]
cwd = "."
check_command = "test -d node_modules"

[[install.steps]]
id = "dependencies"
command = "npm install"
timeout = 1800
interactive = true
notes = "Answer any package manager prompts in the terminal."
```

The install table supports `cwd` and `check_command`. Each step requires a stable `id` and a shell `command`; optional fields are `cwd`, `env`, `env_file`, `timeout` in seconds, `interactive`, and `notes`. Paths resolve relative to the TOML file. Steps run in order, using the configured shell. Avoid putting secrets in TOML. A step can create service directories or environment files; Devenv validates their existence before Run.

## Run projects and services

**Run project** starts the selected project’s enabled services in dependency order. Running another project stops the current project before starting another. **Stop project** shuts services down in reverse dependency order. Devenv runs configured commands in the chosen shell and supervises their process groups.

The Services tab lists commands, declared ports, and live status. Each enabled service has Start, Stop, Retry, or Run again as appropriate. Starting one service also starts missing dependencies. Stopping one stops active dependents but leaves independent services running. **Start remaining** fills in a partially running session. A failed service may leave the session degraded while other services keep running.

Declared ports help Devenv find conflicts during a switch. Keep them accurate: Devenv does not rewrite application ports or environment files. Detached services need explicit readiness and stop commands so Devenv can manage them safely.

## Edit `devenv.toml`

Open the **Config** tab to edit the selected project in Monaco. Devenv validates TOML and project rules before saving. Use **Save** or **⌘S**; **Reload** rereads the file. If another tool changes the file, reload before saving. Unsaved edits remain while you visit Services or Terminal, and Devenv asks before discarding them when you choose another project. Changes to a running project apply the next time its session starts.

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

The Terminal tab shows captured service output. Filter by service or text, pause or follow new lines, and copy visible logs. Clicking a service in the Services tab opens its filtered logs. **Open in …** opens read-only log tabs for the active session in your terminal app; closing those tabs does not stop services. Terminal opens one window per service instead of tabs.

**Open in Finder** beside the project name reveals the selected project’s config file. The **Open in …** button next to it opens a new window of your terminal app in the config directory without starting a session. If the terminal app or macOS Automation access is unavailable, use the built-in Terminal tab.

## Settings and appearance

Settings has three tabs. **General** holds the appearance (light, dark, or system; System follows your Mac and switches with it), your terminal app (Terminal, iTerm2, or Ghostty; onboarding asks the first time), the shell Devenv uses, and **Reset tutorial**, which shows the first-launch tutorial again the next time Devenv launches. Stop the active session before changing shells. The built-in Terminal remains dark, and the Config editor uses a Nord palette. Devenv reads terminal accent colors from your `.zshrc` without executing it. **Workspace** manages search folders and excluded directory names, and **Updates** covers releases. Appearance, terminal app, and folder changes save immediately; if you close Settings with other unsaved edits, Devenv asks before discarding them.

## Updates and menu bar

Packaged builds check the configured GitHub Releases repository shortly after launch and every three hours while running. You can also check manually in Settings or from the menu bar. An available update appears above Settings in the sidebar. Installing requires confirmation: Devenv downloads the installer, stops the session, opens the disk image, and quits. You finish installation by dragging the new app into Applications.

Public releases need no token. A private release repository can use a fine-grained, read-only token saved in Settings. Devenv stores it locally and does not display it again.

The macOS menu bar icon shows the active project and lets you switch projects, stop the project, open the session in your terminal app, show Devenv, and check for updates. Closing the main window leaves Devenv in the menu bar. Quitting stops the active session.

## Troubleshooting and recovery

If a project is missing, check that a search folder contains its `devenv.toml`, then refresh projects. If the config has an error, select that project and open Config to correct it. If startup fails, inspect the Services status and Terminal output; verify commands, working directories, environment files, and declared ports.

Devenv keeps a session journal so it can recover and clean up resources after an unexpected exit. A power loss cannot run shutdown commands; cleanup is attempted on the next launch. If a stop fails, Devenv keeps the session visible so you can inspect and retry it. Project files and database volumes are not deleted by ordinary Stop or Switch actions.
