import { EventEmitter } from 'node:events';
import { stat } from 'node:fs/promises';
import * as pty from 'node-pty';
import { ownedCommand, platform } from './platform';
import { delay, signalGroup, stopGroup } from './process';
import type { HarnessSnapshot } from '../shared/types';

interface Entry { run: number; command: string; output: string; offset: number; terminal?: pty.IPty; exitCode?: number; exited: Promise<void> }
export interface HarnessOptions { cwd: string; command: string; cols: number; rows: number; restart?: boolean }
const scrollback = 200000;

/** Interactive coding-agent terminals, one per project. They are independent of the service session and outlive it. */
export class Harnesses extends EventEmitter {
  private entries = new Map<string, Entry>();
  private opening = new Map<string, Promise<unknown>>();
  private runs = 0;
  constructor(private shell: string, private env: NodeJS.ProcessEnv) { super(); }
  configure(shell: string, env: NodeJS.ProcessEnv) { this.shell = shell; this.env = env; }
  private snapshot(entry: Entry): HarnessSnapshot { return { run: entry.run, command: entry.command, output: entry.output, offset: entry.offset, running: !!entry.terminal, exitCode: entry.exitCode }; }
  /** Attaches to the project's harness, launching it when there is none yet or when `restart` is set. */
  open(id: string, options: HarnessOptions): Promise<HarnessSnapshot> {
    // One at a time per project, so concurrent opens attach to the same launch instead of replacing it.
    const next = (this.opening.get(id) ?? Promise.resolve()).catch(() => {}).then(() => this.launch(id, options));
    this.opening.set(id, next);
    return next;
  }
  private async launch(id: string, options: HarnessOptions): Promise<HarnessSnapshot> {
    const existing = this.entries.get(id);
    if (existing && !options.restart) return this.snapshot(existing);
    if (!(await stat(options.cwd).catch(() => null))?.isDirectory()) throw new Error(`Directory does not exist: ${options.cwd}`);
    await this.close(id);
    // An interactive shell resolves aliases and functions, which is how some harnesses are installed.
    const [file, args] = platform === 'windows' ? ownedCommand(this.shell, options.command, true) : [this.shell, ['-ic', options.command]];
    const terminal = pty.spawn(file, args, { cwd: options.cwd, env: { ...this.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>, cols: options.cols, rows: options.rows, name: 'xterm-256color' });
    const run = ++this.runs, pid = terminal.pid;
    const entry: Entry = { run, command: options.command, output: '', offset: 0, terminal, exited: Promise.resolve() };
    terminal.onData(data => {
      const offset = entry.offset;
      entry.offset += data.length; entry.output = (entry.output + data).slice(-scrollback);
      this.emit('output', { id, run, data, offset });
    });
    entry.exited = new Promise(resolve => terminal.onExit(({ exitCode }) => {
      entry.terminal = undefined; entry.exitCode = exitCode;
      this.emit('exit', { id, run, exitCode });
      // The harness may leave helpers behind in its process group.
      void stopGroup(pid, 250).catch(() => {}).then(resolve);
    }));
    this.entries.set(id, entry);
    return this.snapshot(entry);
  }
  input(id: string, data: string) { this.entries.get(id)?.terminal?.write(data); }
  resize(id: string, cols: number, rows: number) { try { this.entries.get(id)?.terminal?.resize(cols, rows); } catch { /* the harness exited while resizing */ } }
  /** Hangs up the project's harness and forgets its output. */
  async close(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    const terminal = entry.terminal;
    if (!terminal) return entry.exited;
    try { if (platform === 'windows') signalGroup(terminal.pid, 'SIGKILL'); else terminal.kill('SIGHUP'); } catch { /* already gone */ }
    const stopped = await Promise.race([entry.exited.then(() => true), delay(1500).then(() => false)]);
    if (!stopped) { try { signalGroup(terminal.pid, 'SIGKILL'); if (platform !== 'windows') terminal.kill('SIGKILL'); } catch { /* already gone */ } }
    await entry.exited;
  }
  async shutdown() { await Promise.all([...this.entries.keys()].map(id => this.close(id))); }
}
