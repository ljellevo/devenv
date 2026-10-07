## Windows app

Use Ctrl+K for the command menu and Ctrl+S to save configuration. Open in Explorer reveals the config file. The app uses native window controls. Closing the window leaves it in the system tray: click the tray icon to show Devenv, or right-click it for projects and Quit. Quit stops active work.

Choose Windows Terminal or PowerShell. Windows Terminal opens one named log tab per enabled service; standalone PowerShell uses separate windows. Devenv selects PowerShell when Windows Terminal is not installed; install Windows Terminal if you want tabs. Service commands use PowerShell 7 (`pwsh.exe`) when available, with Windows PowerShell (`powershell.exe`) as the fallback. The Shell setting accepts only these two executables.

Windows x64 uses an NSIS installer. Assisted updates stop active work and open the downloaded installer. Follow the installer to replace the app.
