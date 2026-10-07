The UI primitives in `src/renderer/components/ui` are adapted from
[shadcn/ui](https://github.com/shadcn-ui/ui), Copyright (c) 2023 shadcn,
distributed under the MIT License (the same permission and warranty text in
this repository's LICENSE). They use Radix UI, class-variance-authority,
Tailwind CSS, and tailwind-merge. `components.json` keeps the project compatible
with the shadcn CLI for future component additions.

The assisted GitHub Releases update flow and ad-hoc signing approach are based
on the Oppskriftsbanken application. Devenv's implementation
adds explicit architecture matching, download limits, checksum checks, and
session shutdown before installation.

The bundled Monaco Editor browser distribution in `src/renderer/public/monaco-editor`
is Copyright (c) Microsoft Corporation and distributed under the MIT License.
It is included locally so the configuration editor works without a network connection.
