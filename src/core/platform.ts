import { access } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { delimiter, join, isAbsolute, resolve } from 'node:path';
import { hostPlatform, type Platform } from '../shared/platform';
export const platform = hostPlatform(process.platform);
export const powershellQuote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
export const encodedPowerShell = (command: string) => ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')];
export function commandArgs(command: string, host: Platform = platform): string[] {
  return host === 'windows' ? encodedPowerShell(`$ErrorActionPreference = 'Stop'; & { ${command}\n }; if ($LASTEXITCODE) { exit $LASTEXITCODE }; if (-not $?) { exit 1 }`) : ['-c', command];
}
export async function executable(name: string): Promise<string | undefined> {
  const directories = isAbsolute(name) ? [''] : (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const extensions = process.platform === 'win32' && !/\.[^\\/]+$/.test(name) ? ['.exe', '.cmd', '.bat'] : [''];
  for (const directory of directories) for (const extension of extensions) {
    const file = directory ? join(directory, name + extension) : name + extension;
    if (await access(file, constants.X_OK).then(() => true, () => false)) return file;
  }
}
export async function defaultShell(): Promise<string> {
  if (platform === 'windows') {
    const shell = await executable('pwsh') ?? await executable('powershell');
    if (!shell) throw new Error('Install PowerShell 7 or enable Windows PowerShell.');
    return shell;
  }
  return process.env.SHELL || '/bin/bash';
}

export const jobExecutable = () => { const bundled = join(__dirname, 'native', 'devenv-job.exe').replace('app.asar', 'app.asar.unpacked'); return existsSync(bundled) ? bundled : resolve('dist/native/devenv-job.exe'); };
export const ownedCommand = (shell: string, command: string, interactive = false): [string, string[]] => {
  const args = commandArgs(command).filter(arg => !interactive || arg !== '-NonInteractive');
  return platform === 'windows' ? [jobExecutable(), [String(process.pid), shell, ...args]] : [shell, args];
};
