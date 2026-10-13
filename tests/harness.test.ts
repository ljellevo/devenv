import { afterEach, expect, it as testCase } from 'vitest';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Harnesses } from '../src/core/harness';
import { alive } from '../src/core/process';
import type { HarnessExit, HarnessOutput } from '../src/shared/types';

const it = process.platform === 'win32' ? testCase.skip : testCase;
const size = { cols: 80, rows: 24 };
let harnesses: Harnesses | undefined;
const roots: string[] = [];
async function fixture() {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'devenv-harness-'))); roots.push(cwd);
  const active = harnesses = new Harnesses('/bin/sh', process.env);
  let output = '';
  const exits: HarnessExit[] = [];
  active.on('output', (event: HarnessOutput) => { output += event.data; });
  active.on('exit', (event: HarnessExit) => exits.push(event));
  const seen = (text: string) => expect.poll(() => output, { timeout: 10000 }).toContain(text);
  return { cwd, harnesses: active, exits, seen };
}
afterEach(async () => { await harnesses?.shutdown(); harnesses = undefined; await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it('runs the harness in the project folder, forwards input, and reports its exit', async () => {
  const { cwd, harnesses, exits, seen } = await fixture();
  const opened = await harnesses.open('project', { cwd, command: 'pwd; read answer; echo "got $answer"; exit 3', ...size });
  expect(opened).toMatchObject({ running: true, command: 'pwd; read answer; echo "got $answer"; exit 3' });
  await seen(cwd);
  harnesses.input('project', 'hello\r');
  await seen('got hello');
  await expect.poll(() => exits).toEqual([{ id: 'project', run: opened.run, exitCode: 3 }]);
  // The finished harness stays readable until it is restarted or closed.
  const finished = await harnesses.open('project', { cwd, command: 'ignored', ...size });
  expect(finished).toMatchObject({ run: opened.run, running: false, exitCode: 3 });
  expect(finished.output).toContain('got hello');
  expect(finished.offset).toBeGreaterThanOrEqual(finished.output.length);
});

it('attaches to a running harness instead of launching another, and restarts on request', async () => {
  const { cwd, harnesses, exits, seen } = await fixture();
  const command = 'echo "pid $$"; sleep 60';
  const [first, concurrent] = await Promise.all([harnesses.open('project', { cwd, command, ...size }), harnesses.open('project', { cwd, command, ...size })]);
  expect(concurrent.run).toBe(first.run);
  await seen('pid ');
  const attached = await harnesses.open('project', { cwd, command: 'echo other', ...size });
  expect(attached).toMatchObject({ run: first.run, command, running: true });
  const pid = Number(attached.output.match(/pid (\d+)/)![1]);
  expect(alive(pid)).toBe(true);
  const restarted = await harnesses.open('project', { cwd, command: 'echo fresh; sleep 60', ...size, restart: true });
  expect(restarted.run).not.toBe(first.run);
  expect(restarted).toMatchObject({ running: true, output: '' });
  expect(alive(pid)).toBe(false);
  expect(exits.map(exit => exit.run)).toEqual([first.run]);
  await seen('fresh');
});

it('stops the harness when it is closed and rejects a missing folder', async () => {
  const { cwd, harnesses, exits, seen } = await fixture();
  await harnesses.open('project', { cwd, command: 'echo "pid $$"; sleep 60 & wait', ...size });
  await seen('pid ');
  const pid = Number((await harnesses.open('project', { cwd, command: '', ...size })).output.match(/pid (\d+)/)![1]);
  await harnesses.close('project');
  expect(alive(pid)).toBe(false);
  expect(exits).toHaveLength(1);
  harnesses.input('project', 'ignored');
  await expect(harnesses.open('other', { cwd: join(cwd, 'missing'), command: 'true', ...size })).rejects.toThrow('Directory does not exist');
});
