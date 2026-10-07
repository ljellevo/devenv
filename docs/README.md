# Devenv documentation

The app bundles these Markdown topics for offline Help. Host instructions follow the desktop operating system; command and path instructions follow the selected project's execution environment.

- [Shared workflows and configuration](help/shared.md)
- [macOS installation, terminals, and updates](help/macos.md)
- [Linux installation, terminals, and updates](help/linux.md)
- [Windows installation, terminals, and updates](help/windows.md)
- [POSIX shells and cleanup](help/posix.md)
- [PowerShell syntax and paths](help/powershell.md)
- [WSL setup](help/wsl-setup.md)
- [WSL project operations](help/wsl.md)
- [Verification results and outstanding release checks](verification.md)

`src/shared/help.ts` is the typed visibility manifest. It filters topics before rendering or building navigation. Windows Help always includes WSL setup; detailed WSL operations appear for WSL projects. Every heading receives a unique anchor, and composition validates internal links.
