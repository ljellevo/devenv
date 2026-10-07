## WSL setup

WSL projects require WSL 2 and a Linux distribution such as Ubuntu 24.04. From an administrator PowerShell window, install WSL with `wsl --install -d Ubuntu-24.04`, restart if requested, and finish the distribution's user setup. Check versions with `wsl --list --verbose`; WSL 1 is unsupported. WSLg is not required.

Choose the distribution explicitly when adding a WSL search folder. Linux filesystem folders and mounted Windows-drive folders belong to that distribution. A missing distribution or inaccessible mount must be repaired before the project can run; do not substitute native Windows execution.
