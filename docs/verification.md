# Implementation verification

Checked on macOS / Apple Silicon during implementation:

- TypeScript strict typechecking passes.
- Production renderer/main/preload/supervisor/follower bundles build successfully.
- 28 automated tests pass: configuration/discovery, real fixture process lifecycle, startup rollback, cancellation, switching, crash/retry, background cleanup, stale process identity refusal, port-owner decisions, updater downloads/redirects, log rotation, and Ghostty script generation/escaping.
- The standard test suite substitutes the OS process-table boundary because this execution environment prohibits `ps`. Fixture processes are real; tests verify their termination with process signals. Docker and external port ownership are simulated, never reclaimed on the user's machine.
- `npm run package` produces `release/mac-arm64/Devenv.app` using the installed Electron binary. Its ad-hoc signature passes `codesign --verify --deep --strict`.
- `npm start` launched the desktop app. Native accessibility inspection and a screenshot confirmed that the shadcn welcome screen renders correctly with the project sidebar, folder controls, and Settings.

Still requires verification on an unrestricted prepared development machine:

- `npm run test:system`, which uses the actual macOS process table. The environment denied `ps`, and its permission policy rejected an elevated test run.
- Playwright's two UI interaction tests. They are implemented and serve the bundled renderer without a local HTTP server, but Chromium cannot register its macOS Mach port under this tool sandbox. The release workflow runs these checks on macOS CI.
- Folder picker, menu bar switching, real Ghostty tab creation, packaged-app first launch, and the end-to-end update installer flow. The native UI automation stalled during the folder-picker check, so no successful interaction is claimed.
- Intivo → Dealroom → Intivo with actual services. Their configurations were built from the existing launcher/Compose/package files; live databases, model downloads, and running project processes were not altered during verification.
- GitHub release publication and both-architecture DMGs. The workflow is prepared for `ljellevo/devenv`; no release has been published by this implementation session.

The supplied project configs remain in `examples/intivo.toml` and `examples/dealroom.toml`. Copy them into each project's `resources/devenv.toml` as documented in README. The sibling project folders are outside this workspace's writable roots, so the implementation does not claim they have been installed there.
