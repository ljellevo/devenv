import { it, expect } from 'vitest';
import { ghosttyDirectoryScript, ghosttyScript, itermDirectoryScript, itermScript, terminalAppDirectoryScript, terminalAppScript } from '../src/main/terminals';
import type { Session } from '../src/shared/types';
const session = { project: { name: 'Quoted "project"', services: [{ enabled: true, name: 'api', cwd: "/projects/it's quoted", command: 'NEVER_RUN_THIS' }, { enabled: false, name: 'off', cwd: '/tmp' }, { enabled: true, name: 'web', cwd: '/tmp' }] } } as Session;
const args = [session, "/tmp/log's directory", '/Applications/Devenv.app/Contents/MacOS/Devenv', '/app/follower.cjs'] as const;

it('opens only log followers and escapes both shell and AppleScript arguments', () => {
  const script = ghosttyScript(...args);
  expect(script).not.toContain('NEVER_RUN_THIS');
  expect(script).toContain('new tab in win'); expect(script).toContain('ELECTRON_RUN_AS_NODE=1');
  expect(script).toContain('Quoted \\"project\\"'); expect(script).toContain("log'\\\\''s directory");
  expect(script).not.toContain('set_tab_title:Quoted \\"project\\" · off');
});

it('opens a fresh Ghostty window in the config directory without running a command', () => {
  const script = ghosttyDirectoryScript('/Projects/quoted "name"/resources');
  expect(script).toContain('new window with configuration cfg');
  expect(script).toContain('set initial working directory of cfg to "/Projects/quoted \\"name\\"/resources"');
  expect(script).not.toContain('set initial input');
});

it('opens one iTerm2 tab per enabled service in its working directory', () => {
  const script = itermScript(...args);
  expect(script).toContain('tell application "iTerm"');
  expect(script).not.toContain('NEVER_RUN_THIS');
  expect(script.match(/create tab with default profile/g)).toHaveLength(1);
  expect(script).toContain("write text \"cd '/projects/it'\\\\''s quoted' && ELECTRON_RUN_AS_NODE=1");
  expect(script).toContain("log'\\\\''s directory");
  expect(script).toContain('set name to "Quoted \\"project\\" · web"');
  expect(script).not.toContain('· off');
});

it('opens one Terminal window per enabled service and titles it', () => {
  const script = terminalAppScript(...args);
  expect(script).toContain('tell application "Terminal"');
  expect(script).not.toContain('NEVER_RUN_THIS');
  expect(script.match(/set custom title of serviceTab/g)).toHaveLength(2);
  expect(script).toContain("do script \"cd '/projects/it'\\\\''s quoted' && ELECTRON_RUN_AS_NODE=1");
  expect(script).not.toContain('· off');
});

it('opens iTerm2 and Terminal in the config directory without starting a follower', () => {
  for (const script of [itermDirectoryScript('/Projects/quoted "name"/resources'), terminalAppDirectoryScript('/Projects/quoted "name"/resources')]) {
    expect(script).toContain("\"cd '/Projects/quoted \\\"name\\\"/resources'\"");
    expect(script).not.toContain('ELECTRON_RUN_AS_NODE');
  }
});
