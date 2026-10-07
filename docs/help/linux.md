## Linux app

Use Ctrl+K for the command menu and Ctrl+S to save configuration. Open in File Manager reveals the config. Native window controls follow your desktop. Tray availability depends on the desktop's status icon support (GNOME needs the AppIndicator extension). Click the tray icon to show Devenv; its menu offers projects and Quit, which stops active work. If no tray is available, launching Devenv again shows the existing window.

Choose System Terminal or Ghostty. System Terminal prefers xdg-terminal-exec, then x-terminal-emulator, GNOME Terminal or Konsole according to the desktop, Xfce Terminal, and xterm. Install one of these terminal applications. Each enabled service gets its own log window.

Linux x64 packages are `Devenv-<version>-linux-x64.AppImage` and `Devenv-<version>-linux-x64.deb`. On Ubuntu 23.10 and later, use the deb: it installs the AppArmor profile Chromium's sandbox needs. The AppImage cannot install that profile, so it exits with a `chrome-sandbox` error there unless you start it with `--no-sandbox`, which turns off the renderer sandbox. A deb update opens the installer after stopping work. An AppImage update is revealed in the file manager: quit Devenv, replace the old AppImage, make the new file executable, and launch it. Preserve your user data directory.
