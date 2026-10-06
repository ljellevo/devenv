import { it, expect } from 'vitest';
import { ghosttyDirectoryScript, ghosttyScript } from '../src/main/ghostty';
import type { Session } from '../src/shared/types';
it('opens only log followers and escapes both shell and AppleScript arguments', () => {
  const session = { project: { name: 'Quoted "project"', services: [{ enabled: true, name: 'api', cwd: "/projects/it's quoted", command: 'NEVER_RUN_THIS' }, { enabled: false, name: 'off', cwd: '/tmp' }, { enabled: true, name: 'web', cwd: '/tmp' }] } } as Session;
  const script = ghosttyScript(session, "/tmp/log's directory", '/Applications/Devenv.app/Contents/MacOS/Devenv', '/app/follower.cjs');
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
