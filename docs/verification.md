# Implementation verification

Results from 2026-10-07 on macOS / Apple Silicon. Windows, Linux, and WSL builds have **not** passed native validation yet; nothing below claims they have.

## Completed locally

- Strict TypeScript checking and the production build pass.
- Unit/fixture suite: **68 passed**, with **9 native Windows / prepared WSL tests skipped** on this host. Coverage includes command-map resolution for every command field, target identity, Help visibility, Linux and Windows Terminal argument preservation (including `;` escaping in tab titles), port ownership parsing, WSL forwarding-process detection, update asset selection (including `x86_64`/`amd64` Linux names), and the copied project setup prompt. Fixtures compare `realpath`-resolved temp paths so they also hold on Windows runners.
- Native macOS process lifecycle (`npm run test:system`): **15 passed**, using the real process table.
- Playwright renderer suite: **22 passed**. All four Help contexts cover both the command menu and sidebar entry points, visible navigation targets, internal links, and absence of unrelated headings and navigation. They also check the host-specific shortcut, footer, and file-manager labels. A separate test checks that only Windows shows the execution-environment picker and the WSL folder chooser. Documentation loads from the bundled renderer without a documentation server.
- `npm run package` produced the macOS arm64 app. `node scripts/smoke-package.mjs` launched it with an isolated temporary profile, checked renderer and supervisor startup, and awaited shutdown successfully (exit 0).
- A Linux x64 `dir` + `deb` build cross-built from macOS succeeded and confirmed the packaging metadata: `release/linux-unpacked/devenv`, `Devenv-<version>-linux-x64.deb`, maintainer and homepage set, and `devenv.desktop` used as the desktop entry and window class. That build contains macOS native modules, so it was only inspected, not run.

## Required before publishing

- Run the native CI matrix on Windows x64, Ubuntu 24.04 x64, and macOS. Windows Job Object helper compilation, descendant cleanup, timeout, early-parent-exit, background-launcher, and interactive PTY tests have **not run on this Mac**.
- Build and test the Linux x64 companion (`npm run build:companion`) with its native Node runtime and PTY dependencies on Linux. Validate provisioning and packaged Windows operation; never copy macOS native dependencies into it.
- WSL 2 validation is **optional and currently off**: GitHub-hosted Windows runners cannot run WSL 2, so releases publish without it. To enable it, provide a prepared self-hosted runner labeled `Windows`, `X64`, `devenv-wsl2`, with a disposable WSL 2 Ubuntu 24.04 distribution named `Devenv-Test`. Install Node 24, npm, and the Visual Studio C++ toolchain. Configure a normal Linux user and accessible Windows-drive mounts. The release WSL job intentionally terminates only distributions whose names begin with `Devenv-Test`; never point it at a working development distribution. Then set the repository variable `DEVENV_WSL_RUNNER` to `true`; the `wsl` job then runs and a failure blocks publishing.
- Run the WSL integration suite: discovery, editing, overrides, installation, path translation, disconnect cleanup, missing-distribution errors, and distribution termination with automatic reconnect. These tests are present but have **not run anywhere** yet.
- Extend native integration coverage for target switching during startup, mounted Windows-drive projects, PID reuse and recovery, missing mounts, WSL 1, two distributions, Docker ownership, and WSL NAT versus mirrored networking. Current release tests do not yet cover this whole matrix.
- Validate real external terminals (GNOME Terminal, Konsole, Xfce Terminal, xterm, Ghostty, Windows Terminal tabs and titles, standalone PowerShell), GNOME/KDE tray behavior, Windows Terminal escaping, installer launch, and assisted updates for DMG/NSIS/deb/AppImage. Automated argument tests do not replace native terminal checks.
- Build all release artifacts and run the packaged smoke tests on every host. The release workflow chooses one version and requires all build jobs (plus the WSL job when enabled) before publishing. No release was published in this session.

## Behavior that needs native confirmation

These changes are covered by unit tests or code review only:

- Every helper command (`exec`) now runs with `windowsHide`, so process-table, port, and WSL queries should not flash console windows on Windows.
- When a WSL companion exits or its distribution stops, Devenv clears the session and reports the error; the next request starts a fresh companion, which recovers its journal.
- Before starting a WSL project, the Windows-side port check ignores WSL forwarding processes (`wslrelay`, `wslhost`, `wslservice`, `vmmem`) and reports any other owner.
- On Linux and WSL the process table is read with `ps -eo`; macOS keeps `ps -axo`.
- The Windows Shell setting accepts only `pwsh.exe` or `powershell.exe`. Devenv defaults to standalone PowerShell when Windows Terminal is not installed.

## Known implementation limits

- External native Windows listeners require manual shutdown after Docker-aware checks; Devenv only terminates its own Job Objects. It never stops WSL networking processes.
- Windows background launchers report their exit separately while the helper retains the Job Object until explicit cleanup and termination. This protocol requires native lifecycle validation, including supervisor loss and PID reuse.
- WSL project folders have a distribution-specific target. Windows-drive projects can switch between native and a WSL distribution while stopped; Linux-filesystem projects cannot be switched to native Windows.
- The companion is provisioned once per app version. Development builds reuse the same version number, so delete `~/.local/share/devenv/companion/<version>` inside the distribution after changing companion code.
