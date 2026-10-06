import { exec, quote } from '../core/process';
import type { Session } from '../shared/types';
export const appleString = (value: string) => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\r', '\\r') + '"';
export function ghosttyScript(session: Session, logDirectory: string, executable: string, follower: string) {
  const lines = ['tell application "Ghostty"', 'activate'];
  session.project.services.filter(s => s.enabled).forEach((service, index) => {
    const command = `ELECTRON_RUN_AS_NODE=1 ${quote(executable)} ${quote(follower)} ${quote(logDirectory)} ${quote(service.name)}`;
    lines.push('set cfg to new surface configuration', `set initial working directory of cfg to ${appleString(service.cwd)}`, `set initial input of cfg to ${appleString(command)} & return`);
    if (index === 0) lines.push('set win to new window with configuration cfg', 'set serviceTab to selected tab of win');
    else lines.push('set serviceTab to new tab in win with configuration cfg');
    lines.push('delay 0.3', `perform action ${appleString(`set_tab_title:${session.project.name} · ${service.name}`)} on focused terminal of serviceTab`);
    // Accessing a terminal detects the known "empty tab" scripting failure.
    lines.push('if (count of terminals of serviceTab) is 0 then error "Ghostty created an empty tab. Update Ghostty or use Devenv logs."');
  });
  lines.push('end tell'); return lines.join('\n');
}
export async function openGhostty(session: Session, directory: string, executable: string, follower: string) {
  try { await exec('/usr/bin/osascript', ['-e', ghosttyScript(session, directory, executable, follower)], { timeout: 30000 }); }
  catch (error) { throw new Error(`Could not open Ghostty tabs. Check that Ghostty is installed and macOS Automation access is allowed. Built-in logs remain available. ${error instanceof Error ? error.message : String(error)}`); }
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

export async function openGhosttyDirectory(directory: string) {
  try { await exec('/usr/bin/osascript', ['-e', ghosttyDirectoryScript(directory)], { timeout: 30000 }); }
  catch (error) { throw new Error(`Could not open a Ghostty window. Check that Ghostty is installed and macOS Automation access is allowed. ${error instanceof Error ? error.message : String(error)}`); }
}
