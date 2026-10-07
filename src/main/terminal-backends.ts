import { spawn } from 'node:child_process';
import { executable, defaultShell, encodedPowerShell, powershellQuote } from '../core/platform';
import type { TerminalApp } from '../shared/types';
export type LinuxTerminal = 'xdg-terminal-exec' | 'x-terminal-emulator' | 'gnome-terminal' | 'konsole' | 'xfce4-terminal' | 'xterm' | 'ghostty';
export function linuxTerminalArgs(backend: LinuxTerminal, directory: string, argv: string[]): string[] {
  switch (backend) {
    case 'xdg-terminal-exec': return ['--', ...argv];
    case 'gnome-terminal': return ['--working-directory', directory, '--', ...argv];
    case 'konsole': return ['--workdir', directory, '-e', ...argv];
    case 'ghostty': return [`--working-directory=${directory}`, '-e', ...argv];
    // cwd is supplied to spawn. Xfce's -x keeps argv separate, unlike --command.
    case 'xfce4-terminal': return ['--working-directory', directory, '-x', ...argv];
    default: return ['-e', ...argv];
  }
}
export async function linuxBackend(terminal: TerminalApp): Promise<LinuxTerminal> {
  const desktop = `${process.env.XDG_CURRENT_DESKTOP ?? ''} ${process.env.DESKTOP_SESSION ?? ''}`;
  const desktops: LinuxTerminal[] = /kde/i.test(desktop) ? ['konsole', 'gnome-terminal'] : ['gnome-terminal', 'konsole'];
  const candidates: LinuxTerminal[] = terminal === 'ghostty' ? ['ghostty'] : ['xdg-terminal-exec', 'x-terminal-emulator', ...desktops, 'xfce4-terminal', 'xterm'];
  for (const candidate of candidates) if (await executable(candidate)) return candidate;
  throw new Error('No supported terminal found. Install a terminal or use built-in logs.');
}
export async function spawnTerminal(file: string, args: string[], cwd: string) {
  const child = spawn(file, args, { cwd, detached: true, stdio: 'ignore', windowsHide: false });
  await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
}
// Windows Terminal splits its command line on ';' unless escaped. The title stays fixed instead of following the shell.
export const windowsTerminalArgs = (shell: string, args: string[], title?: string) => ['-w', '0', 'new-tab', ...(title ? ['--title', title.replaceAll(';', '\\;'), '--suppressApplicationTitle'] : []), shell, ...args];
export async function openNativeTerminal(terminal: TerminalApp, directory: string, follower?: { executable: string; script: string; logDirectory: string; service: string; title?: string }) {
  if (process.platform === 'linux') {
    const backend = await linuxBackend(terminal);
    const argv = follower ? ['env', 'ELECTRON_RUN_AS_NODE=1', follower.executable, follower.script, follower.logDirectory, follower.service] : [await defaultShell()];
    await spawnTerminal(backend, linuxTerminalArgs(backend, directory, argv), directory);
  } else {
    const shell = await defaultShell();
    const command = `Set-Location -LiteralPath ${powershellQuote(directory)};` + (follower ? `$env:ELECTRON_RUN_AS_NODE='1'; & ${[follower.executable, follower.script, follower.logDirectory, follower.service].map(powershellQuote).join(' ')}` : '');
    const args = encodedPowerShell(command).filter(arg => arg !== '-NonInteractive');
    args.unshift('-NoExit');
    if (terminal === 'terminal') await spawnTerminal('wt.exe', windowsTerminalArgs(shell, args, follower?.title), directory);
    else await spawnTerminal(shell, args, directory);
  }
}

export async function openWslTerminal(terminal: TerminalApp, distribution: string, directory: string, follower?: { runtime: string; directory: string; service: string; title?: string }) {
  const command = ['wsl.exe', '--distribution', distribution, '--cd', directory, ...(follower ? ['--exec', `${follower.runtime}/bin/node`, `${follower.runtime}/follower.cjs`, follower.directory, follower.service] : [])];
  const shell = await defaultShell();
  const args = ['-NoExit', ...encodedPowerShell(`& ${command.map(powershellQuote).join(' ')}`).filter(arg => arg !== '-NonInteractive')];
  if (terminal === 'terminal') await spawnTerminal('wt.exe', windowsTerminalArgs(shell, args, follower?.title), process.cwd());
  else await spawnTerminal(shell, args, process.cwd());
}
