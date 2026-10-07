# Security

Devenv runs local shell commands with your account's permissions. Only run trusted `devenv.toml` files, including their install recipes, readiness checks, and stop commands. Port reclamation may stop other local processes or containers on declared ports.

Logs can contain secrets printed by your services. An optional GitHub update token is stored in a local file with mode `0600`, not in Keychain. Do not include logs, tokens, `.env` files, or local application data in public reports without reviewing and redacting them.

## Reporting a vulnerability

Use **Security → Advisories → Report a vulnerability** on the [GitHub repository](https://github.com/ljellevo/devenv/security) if private reporting is available. If it is unavailable, open an issue asking the maintainer for a private reporting channel, without exploit details or sensitive data. Do not disclose a vulnerability in a public issue or pull request before coordinating with the maintainer.

Include affected versions, impact, reproduction steps, and a minimal example without real credentials. Security fixes target the latest release; older releases have no separate maintenance commitment.
