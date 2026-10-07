## Shells, environments, and cleanup

Commands use the user's shell, falling back to Bash. Devenv loads the login shell environment and overlays `env_file` and `env`. Paths are relative to the TOML file. Quote paths containing spaces or shell metacharacters.

Foreground services run in owned POSIX process groups. Stop commands run before remaining processes are terminated. Background resources need explicit readiness and cleanup commands. Port reclamation checks process identity and protects interactive shells and infrastructure processes. Inaccessible port ownership is an error, not a free port. Docker-backed ports are reclaimed by stopping the owning container.
