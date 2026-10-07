import { exec, quote } from '../core/process';
import { terminalLabel } from '../shared/terminals';
import type { Session, TerminalApp } from '../shared/types';
export const appleString = (value: string) => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\r', '\\r') + '"';
const followerCommand = (logDirectory: string, executable: string, follower: string, service: string) =>
  `ELECTRON_RUN_AS_NODE=1 ${quote(executable)} ${quote(follower)} ${quote(logDirectory)} ${quote(service)}`;
const enabled = (session: Session) => session.project.services.filter(s => s.enabled);
const tabTitle = (session: Session, service: string) => `${session.project.name} · ${service}`;

export function ghosttyScript(session: Session, logDirectory: string, executable: string, follower: string) {
  const lines = ['tell application "Ghostty"', 'activate'];
  enabled(session).forEach((service, index) => {
    const command = followerCommand(logDirectory, executable, follower, service.name);
    lines.push('set cfg to new surface configuration', `set initial working directory of cfg to ${appleString(service.cwd)}`, `set initial input of cfg to ${appleString(command)} & return`);
    if (index === 0) lines.push('set win to new window with configuration cfg', 'set serviceTab to selected tab of win');
    else lines.push('set serviceTab to new tab in win with configuration cfg');
    lines.push('delay 0.3', `perform action ${appleString(`set_tab_title:${tabTitle(session, service.name)}`)} on focused terminal of serviceTab`);
    // Accessing a terminal detects the known "empty tab" scripting failure.
    lines.push('if (count of terminals of serviceTab) is 0 then error "Ghostty created an empty tab. Update Ghostty or use Devenv logs."');
  });
  lines.push('end tell'); return lines.join('\n');
}

export function ghosttyDirectoryScript(directory: string) {
  return [
    'tell application "Ghostty"',
    'activate',
    'set cfg to new surface configuration',
    `set initial working directory of cfg to ${appleString(directory)}`,
    'set win to new window with configuration cfg',
    'end tell',
  ].join('\n');
}

// iTerm2 and Terminal open a blank window when scripting launches them; reuse it instead of leaving it behind.
const itermWindow = ['if not wasRunning and (count of windows) > 0 then', 'set win to current window', 'else', 'set win to (create window with default profile)', 'end if'];

export function itermScript(session: Session, logDirectory: string, executable: string, follower: string) {
  const lines = ['set wasRunning to application "iTerm" is running', 'tell application "iTerm"', 'activate'];
  enabled(session).forEach((service, index) => {
    const command = `cd ${quote(service.cwd)} && ${followerCommand(logDirectory, executable, follower, service.name)}`;
    if (index === 0) lines.push(...itermWindow, 'set serviceSession to current session of win');
    else lines.push('tell win to set serviceTab to (create tab with default profile)', 'set serviceSession to current session of serviceTab');
    lines.push(`tell serviceSession to set name to ${appleString(tabTitle(session, service.name))}`, `tell serviceSession to write text ${appleString(command)}`);
  });
  lines.push('end tell'); return lines.join('\n');
}

export function itermDirectoryScript(directory: string) {
  return ['set wasRunning to application "iTerm" is running', 'tell application "iTerm"', 'activate', ...itermWindow, `tell current session of win to write text ${appleString(`cd ${quote(directory)}`)}`, 'end tell'].join('\n');
}

// Terminal's scripting dictionary cannot create tabs without UI scripting, so each service gets its own window.
const terminalAppRun = (command: string) => [
  'if not wasRunning and (count of windows) > 0 then',
  `set serviceTab to do script ${appleString(command)} in window 1`,
  'set wasRunning to true',
  'else',
  `set serviceTab to do script ${appleString(command)}`,
  'end if',
];

export function terminalAppScript(session: Session, logDirectory: string, executable: string, follower: string) {
  const lines = ['set wasRunning to application "Terminal" is running', 'tell application "Terminal"', 'activate'];
  for (const service of enabled(session)) {
    lines.push(...terminalAppRun(`cd ${quote(service.cwd)} && ${followerCommand(logDirectory, executable, follower, service.name)}`));
    lines.push(`set custom title of serviceTab to ${appleString(tabTitle(session, service.name))}`);
  }
  lines.push('end tell'); return lines.join('\n');
}

export function terminalAppDirectoryScript(directory: string) {
  return ['set wasRunning to application "Terminal" is running', 'tell application "Terminal"', 'activate', ...terminalAppRun(`cd ${quote(directory)}`), 'end tell'].join('\n');
}

const sessionScripts = { ghostty: ghosttyScript, iterm: itermScript, terminal: terminalAppScript };
const directoryScripts = { ghostty: ghosttyDirectoryScript, iterm: itermDirectoryScript, terminal: terminalAppDirectoryScript };
const osascript = (script: string) => exec('/usr/bin/osascript', ['-e', script], { timeout: 30000 });

export async function openSessionTerminal(terminal: TerminalApp, session: Session, directory: string, executable: string, follower: string) {
  const name = terminalLabel(terminal);
  try { await osascript(sessionScripts[terminal](session, directory, executable, follower)); }
  catch (error) { throw new Error(`Could not open ${name} ${terminal === 'terminal' ? 'windows' : 'tabs'}. Check that ${name} is installed and macOS Automation access is allowed. Built-in logs remain available. ${error instanceof Error ? error.message : String(error)}`); }
}

export async function openDirectoryTerminal(terminal: TerminalApp, directory: string) {
  const name = terminalLabel(terminal);
  try { await osascript(directoryScripts[terminal](directory)); }
  catch (error) { throw new Error(`Could not open a ${name} window. Check that ${name} is installed and macOS Automation access is allowed. ${error instanceof Error ? error.message : String(error)}`); }
}
