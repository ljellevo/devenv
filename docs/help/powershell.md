## PowerShell commands and paths

Native Windows projects use PowerShell syntax and Windows paths. Each command runs as a PowerShell script block that stops on the first error and returns the last native exit code. Prefer literal TOML strings for backslashes, for example `cwd = 'C:\work\my project'`. Use `npm.cmd` when script execution policy prevents `npm.ps1` from running. Windows PowerShell does not support all PowerShell 7 syntax, including `&&`; provide commands compatible with the configured shell.

Environment files and `env` override the shell environment. Keep secrets out of versioned TOML. Configured stop commands must clean up external resources. If a port belongs to a protected or inaccessible process, stop it manually.
