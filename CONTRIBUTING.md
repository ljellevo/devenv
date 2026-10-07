# Contributing to Devenv

Follow the [developer installation guide](README.md#developer-installation) to set up a Mac with Node.js 24 and npm. Fork the repository, create a branch, and use `npm ci` to install the locked dependencies.

Keep pull requests focused. Describe the problem, the resulting behavior, and how you verified it. Add or update tests for behavior changes and update the documentation when changing configuration or user workflows. Commit `package-lock.json` when changing dependencies.

Before opening a pull request, run:

```sh
npm test
npm run build
npx playwright install chromium
npm run test:ui
npm run test:system
```

The build includes TypeScript checking. System tests require macOS process inspection. If a check cannot run, include the command and the limitation in your pull request. Pull-request CI runs these checks on macOS without publishing an app.

Use disposable projects when testing lifecycle and port reclamation changes. Check that stopping, switching, startup failure, and quitting clean up the resources Devenv started. Do not use production databases or another person's running services for these checks.

Report bugs through [GitHub Issues](https://github.com/ljellevo/devenv/issues), including the app version, macOS version, architecture, and reproduction steps. Redact logs and configurations before sharing them. For vulnerabilities, follow [SECURITY.md](SECURITY.md).

Windows and Linux are not currently supported. Discuss platform ports before starting substantial work: they need process ownership and cleanup validation as well as UI and installer changes.

Contributions are distributed under the repository's [MIT license](LICENSE).
