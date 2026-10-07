import { executionPlatform, type Platform, type ExecutionTarget } from './platform';

export interface ProjectPromptContext { host: Platform; target: ExecutionTarget }
export function projectSetupPrompt(configPath: string, context?: ProjectPromptContext): string {
  return `Set up Devenv for the project containing this file: ${configPath}
${context ? `\nDesktop host: ${context.host}. Project execution platform: ${executionPlatform(context.host, context.target)}${context.target.kind === 'wsl' ? ` (WSL 2 distribution: ${context.target.distribution})` : ' (native)'}. Use the execution platform for shell syntax and paths; the desktop host does not determine WSL commands.\n` : ''}
Inspect the project before editing. Read its README, package scripts, development shell scripts, Docker Compose files, environment examples, and service directories to find the commands developers actually use. Then fill out the empty devenv.toml at the path above. Edit that file only; do not run services, migrations, installers, or cleanup commands while preparing the config.

Cross-platform configuration:
- Keep one devenv.toml for the project, not separate files per OS. Share service names, ports, dependencies, and paths; override only commands that differ.
- Every command field accepts a plain string or a platform map: service command, ready_command, stop_command, logs_command, install.check_command, and each install step's command.
- The only supported map keys are macos, linux, windows, and default. The execution platform's exact key wins over default. A map without a matching key or default is invalid. WSL 2 uses linux, not windows or a wsl key.
- Keep TOML inline maps on one line, for example: command = { default = "npm run dev", windows = "npm.cmd run dev" }.
- Native Windows commands use PowerShell 7, falling back to Windows PowerShell. Do not assume && works in the fallback. Use npm.cmd when needed to avoid npm.ps1 execution-policy issues. POSIX commands use the user's shell. For WSL, use Linux paths and tools from the selected distribution; never substitute Windows execution.
- For longer platform-specific logic, prefer existing scripts such as scripts/dev.sh and scripts/dev.ps1, selected from the same TOML command map. This task only edits devenv.toml: if new scripts are needed, describe that follow-up instead of creating them.
- Include overrides only when supported by the project's actual tooling; do not invent unsupported platform behavior. State any platform limitations and prerequisites in the final summary.

Devenv's TOML format:
- Start with version = 1 and a descriptive name = "...".
- If a fresh clone needs dependencies, setup commands, or generated files before it can run, add an [install] table. Set cwd relative to devenv.toml, and use an optional, read-only check_command that exits 0 only when installation is complete. Add one [[install.steps]] table per command, in order. Each step needs a stable unique id and command; optional cwd, env, env_file, timeout (seconds), interactive, and notes. Set interactive = true for commands that ask questions; explain required answers in notes. Keep secrets out of TOML and do not run the installer while preparing this file.
- Keep installation commands repeatable when possible. Steps are run once and recorded under .devenv/ (install.json for native projects, distribution-specific files for WSL); changing resolved install commands or execution identity invalidates that record. Use check_command for requirements that can drift after setup. Never put destructive cleanup or production deployment in install steps.
- Add one [services.<name>] table per required local service. Names use letters, numbers, hyphens, or underscores.
- Each service needs a command. The optional cwd and env_file paths are relative to devenv.toml, not the repository root. Use cwd = "." if the command runs beside the config file.
- Declare published/listening host ports with ports = [1234] so Devenv can detect conflicts when switching projects. Use depends_on = ["other-service"] for startup order.
- The default mode is "process" for foreground commands that keep running. Use mode = "task" for a command that finishes, such as a migration. Use mode = "background" only for commands that detach; background services require both ready_command and stop_command, and should have logs_command when logs can be followed.
- Use ready_command for a short, read-only readiness check when startup requires more than a process being alive. Set startup_timeout high enough for genuinely slow local dependencies, such as model loading. Do not use a readiness check that always succeeds.
- Use stop_command only when the owned foreground process tree cannot be stopped by Devenv. Keep secrets out of the TOML; point env_file to an existing local file when needed.
- List all services needed for the usual development session, including databases and supporting tools. Preserve the project's existing commands and dependency order rather than inventing alternatives. Mark optional services with enabled = false.

Example shape (replace every example value with facts from this project):
version = 1
name = "Project name"

[services.api]
cwd = "."
command = "actual development command"
ports = [3100]

[install]
cwd = "."
check_command = "actual read-only command that confirms dependencies are installed"

[[install.steps]]
id = "dependencies"
command = "actual dependency installation command"

Optional fields include depends_on, mode, ready_command, stop_command, logs_command, startup_timeout and stop_timeout (both in seconds), enabled, env, and env_file. A foreground process can use allow_successful_exit = true only if finishing successfully is normal for that command.

Ensure the TOML is syntactically valid. Install steps may create service working directories or environment files, so those paths need to exist by Run project time. If a command, port, or environment requirement is uncertain, leave a concise TOML comment describing the assumption and mention it in your response. Do not put placeholder services or install commands in the final config. Summarize the services and install steps you configured, and any manual setup still needed.`;
}
