/** The AGENTS.md section written into a new project, so its coding agent keeps devenv.toml in step with the code. */
export const agentGuideHeading = '## Devenv';
export const agentGuide = `${agentGuideHeading}

This project is installed and run with Devenv. The \`devenv.toml\` in this folder is the single source of truth for local development: the Devenv app reads it to install the project and to start, stop, and order every service.

**Always keep \`devenv.toml\` up to date.** Whenever a change alters how the project is installed or run, update \`devenv.toml\` in the same change. That includes:

- adding, renaming, or removing a service, worker, database, or any other process a developer needs running
- changing a start command, working directory, port, environment file, or startup order
- adding or changing a dependency install, code generation, migration, or other setup step a fresh clone needs
- adding a command that differs between macOS, Linux, and Windows

Do not leave install or run instructions only in a README, a script, or your reply. If a developer would have to type a new command to get the project installed or running, that command belongs in \`devenv.toml\`. When the project is still empty, add its first service and install step as soon as they exist.

### Format

- Start with \`version = 1\` and \`name = "..."\`. Every path is relative to \`devenv.toml\`.
- Add one \`[services.<name>]\` table per process. Names use letters, digits, \`-\`, or \`_\`. Each needs a \`command\`; optional fields are \`cwd\`, \`ports = [3000]\` (every host port it listens on), \`depends_on = ["db"]\`, \`env\`, \`env_file\`, and \`enabled = false\` for optional services.
- \`mode\` is \`"process"\` by default, for a foreground command that keeps running. Use \`"task"\` for a command that finishes, such as a migration, and \`"background"\` only for a command that detaches, which then also needs \`ready_command\` and \`stop_command\`.
- \`ready_command\` is a short, read-only check that exits 0 once the service is usable. \`startup_timeout\` and \`stop_timeout\` are in seconds.
- Describe what a fresh clone needs in \`[install]\`: a \`cwd\`, an optional read-only \`check_command\` that exits 0 only when installation is complete, and one \`[[install.steps]]\` table per command, in order. Each step needs a unique \`id\` and a \`command\`; optional fields are \`cwd\`, \`env\`, \`env_file\`, \`timeout\`, \`interactive = true\` for commands that ask questions, and \`notes\`.
- Any command may be a single-line platform map instead of a string: \`command = { default = "npm run dev", windows = "npm.cmd run dev" }\`. The keys are \`macos\`, \`linux\`, \`windows\`, and \`default\`.
- Keep secrets out of \`devenv.toml\`; point \`env_file\` at a local file instead.

### Example

\`\`\`toml
version = 1
name = "Project name"

[services.db]
command = "docker compose up postgres"
ports = [5432]

[services.api]
cwd = "./api"
command = "npm run dev"
ports = [3100]
depends_on = ["db"]

[install]
cwd = "."
check_command = "test -d api/node_modules"

[[install.steps]]
id = "dependencies"
cwd = "./api"
command = "npm install"
\`\`\`

After editing, check that the TOML is valid, that every \`cwd\` and \`env_file\` exists or is created by an install step, and that no placeholder service or command is left behind.
`;
