import { describe, expect, it } from 'vitest';
import { composeHelp } from '../src/shared/help';
import { resolveCommand, projectId, validateProjectText } from '../src/core/config';
import { executionPlatform } from '../src/shared/platform';
import { parseDistributions, wslUNC, explorerPath } from '../src/core/wsl';
import { linuxTerminalArgs, windowsTerminalArgs } from '../src/main/terminal-backends';
import { encodedPowerShell, powershellQuote } from '../src/core/platform';
import { pickAsset } from '../src/core/updater';
import { parseSS, wslNetworkingProcess } from '../src/core/port-inspection';
import { resolve } from 'node:path';

describe('platform commands and identity', () => {
  it('resolves platform before default, rejects bad keys and absent matches', () => {
    expect(resolveCommand({ default: 'npm run dev', windows: 'npm.cmd run dev' }, 'windows')).toBe('npm.cmd run dev');
    expect(resolveCommand({ default: 'npm run dev', windows: 'npm.cmd run dev' }, 'linux')).toBe('npm run dev');
    expect(() => resolveCommand({ windows: 'yes' }, 'linux')).toThrow('no match');
    expect(() => resolveCommand({ win32: 'yes' } as any, 'windows')).toThrow();
    expect(() => resolveCommand({ default: '' }, 'linux')).toThrow();
    expect(executionPlatform('windows', { kind: 'wsl', distribution: 'Ubuntu' })).toBe('linux');
    expect(projectId('/same', { kind: 'wsl', distribution: 'A' })).not.toBe(projectId('/same', { kind: 'wsl', distribution: 'B' }));
  });
  it('resolves all command fields and scopes installation hashes to target identity', async () => {
    const command = '{ default = "posix", windows = "powershell" }';
    const text = `version=1\nname="Fixture"\n[services.api]\ncommand=${command}\nready_command=${command}\nstop_command=${command}\nlogs_command=${command}\n[install]\ncheck_command=${command}\n[[install.steps]]\nid="setup"\ncommand=${command}`;
    const native = await validateProjectText(resolve('devenv.toml'), text, { host: 'windows', target: { kind: 'native' } });
    const wsl = await validateProjectText(resolve('devenv.toml'), text, { host: 'windows', target: { kind: 'wsl', distribution: 'Ubuntu' } });
    for (const field of ['command', 'ready_command', 'stop_command', 'logs_command'] as const) expect(native.services[0][field]).toBe('powershell');
    expect(native.install?.check_command).toBe('powershell'); expect(wsl.install?.steps[0].command).toBe('posix');
    expect(native.install?.recipeHash).not.toBe(wsl.install?.recipeHash);
  });
});

describe('offline Help composition', () => {
  it.each([
    ['macos', { kind: 'native' }, ['shared', 'macos', 'posix']],
    ['linux', { kind: 'native' }, ['shared', 'linux', 'posix']],
    ['windows', { kind: 'native' }, ['shared', 'windows', 'powershell', 'wsl-setup']],
    ['windows', { kind: 'wsl', distribution: 'Ubuntu' }, ['shared', 'windows', 'posix', 'wsl-setup', 'wsl']],
  ] as const)('filters document and navigation for %s %j', (host, target, topics) => {
    const document = composeHelp({ host, target });
    expect(document.topics).toEqual(topics);
    expect(new Set(document.headings.map(h => h.id)).size).toBe(document.headings.length);
    for (const heading of document.sections) expect(document.markdown).toContain(`## ${heading.title}`);
    if (host !== 'macos') expect(document.markdown).not.toContain('## macOS app');
    if (host !== 'windows') expect(document.markdown).not.toContain('## Windows app');
    if (target.kind === 'native') expect(document.markdown).not.toContain('## WSL project execution');
  });
});

it('preserves literal terminal arguments and encodes PowerShell metacharacters', () => {
  const path = "/space ünicode/o'hare\\$x;`code`";
  for (const backend of ['xdg-terminal-exec', 'x-terminal-emulator', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm', 'ghostty'] as const) {
    const argv = ['node', path, 'log & name'];
    expect(linuxTerminalArgs(backend, path, argv).slice(-3)).toEqual(argv);
  }
  const command = `Set-Location -LiteralPath ${powershellQuote(path)}`;
  expect(Buffer.from(encodedPowerShell(command).at(-1)!, 'base64').toString('utf16le')).toBe(command);
  expect(powershellQuote("o'hare")).toBe("'o''hare'");
  // Windows Terminal treats ';' as a command separator unless escaped.
  expect(windowsTerminalArgs('pwsh.exe', ['-NoExit'], 'a;b · api')).toEqual(['-w', '0', 'new-tab', '--title', 'a\\;b · api', '--suppressApplicationTitle', 'pwsh.exe', '-NoExit']);
  expect(windowsTerminalArgs('pwsh.exe', ['-NoExit'])).toEqual(['-w', '0', 'new-tab', 'pwsh.exe', '-NoExit']);
});

it('parses localized WSL listings and preserves distribution paths', () => {
  expect(parseDistributions('  NAME                   STATE           VERSION\r\n* Ubuntu-24.04           Running         2\r\n  Legacy                 Stopped         1')).toEqual([{ name: 'Ubuntu-24.04', version: 2 }, { name: 'Legacy', version: 1 }]);
  expect(wslUNC('\\\\wsl.localhost\\Ubuntu-24.04\\home\\me')).toEqual({ distribution: 'Ubuntu-24.04', path: '/home/me' });
  expect(explorerPath('Ubuntu', '/home/me')).toBe('\\\\wsl.localhost\\Ubuntu\\home\\me');
  expect(() => explorerPath('Ubuntu', 'relative')).toThrow();
});
it('refuses inaccessible listening sockets', () => {
  expect(parseSS('LISTEN 0 128 0.0.0.0:3100 0.0.0.0:* users:(("node",pid=42,fd=9))', 3100)).toEqual([42]);
  expect(() => parseSS('LISTEN 0 128 0.0.0.0:3100 0.0.0.0:*', 3100)).toThrow('inaccessible');
  // WSL forwarding processes are not Windows-side conflicts for WSL projects.
  expect(['wslrelay', 'wslhost', 'vmmemWSL'].every(wslNetworkingProcess)).toBe(true);
  expect(['node', 'svchost', ''].some(wslNetworkingProcess)).toBe(false);
});
it('selects update platform, architecture, and exact package format', () => {
  const assets = ['Devenv-1.0.0-x64.dmg', 'Devenv-1.0.0-windows-x64.exe', 'Devenv-1.0.0-linux-x64.deb', 'Devenv-1.0.0-linux-x64.AppImage'].map((name, id) => ({ id, name, size: 10 }));
  expect(pickAsset(assets, 'x64', 'macos')?.id).toBe(0);
  expect(pickAsset(assets, 'x64', 'windows')?.id).toBe(1);
  expect(pickAsset(assets, 'x64', 'linux', 'deb')?.id).toBe(2);
  expect(pickAsset(assets, 'x64', 'linux', 'AppImage')?.id).toBe(3);
  expect(pickAsset(assets, 'arm64', 'windows')).toBeUndefined();
  expect(pickAsset(assets, 'x64', 'windows', 'deb')).toBeUndefined();
  const conventional = ['Devenv-1.0.0-linux-x86_64.AppImage', 'Devenv-1.0.0-linux-amd64.deb'].map((name, id) => ({ id, name, size: 10 }));
  expect(pickAsset(conventional, 'x64', 'linux', 'AppImage')?.id).toBe(0);
  expect(pickAsset(conventional, 'x64', 'linux', 'deb')?.id).toBe(1);
});
