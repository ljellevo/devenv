import { mkdirSync, appendFileSync, statSync, renameSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LogEntry } from '../shared/types';

export class Logs {
  private seq = 0;
  private entries: LogEntry[] = [];
  private retainedBytes = 0;
  private writtenSincePrune = 0;
  readonly directory: string;
  constructor(root: string, session: string, private emit: (entry: LogEntry) => void) {
    this.directory = join(root, 'logs', session);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    writeFileSync(join(this.directory, 'active'), '', { mode: 0o600 });
    this.prune(root);
  }
  write(service: string, stream: LogEntry['stream'], text: string) {
    // Bound individual writes and retained UI history even for output without newlines.
    for (let offset = 0; offset < text.length; offset += 16000) {
      const entry: LogEntry = { seq: ++this.seq, time: new Date().toISOString(), service, stream, text: text.slice(offset, offset + 16000) };
      this.entries.push(entry);
      this.retainedBytes += Buffer.byteLength(entry.text);
      while (this.entries.length > 1500 || this.retainedBytes > 2 * 1024 * 1024) this.retainedBytes -= Buffer.byteLength(this.entries.shift()!.text);
      const file = join(this.directory, `${service}.jsonl`);
      if (this.size(file) > 1024 * 1024) {
        rmSync(file + '.1', { force: true }); renameSync(file, file + '.1');
      }
      appendFileSync(file, JSON.stringify(entry) + '\n', { mode: 0o600 });
      this.writtenSincePrune += Buffer.byteLength(entry.text);
      if (this.writtenSincePrune > 1024 * 1024) {
        this.writtenSincePrune = 0;
        const files = readdirSync(this.directory).filter(name => name.endsWith('.jsonl') || name.endsWith('.jsonl.1')).map(name => join(this.directory, name));
        let total = files.reduce((sum, path) => sum + this.size(path), 0);
        // Cap the active session as well, even if it contains hundreds of noisy services.
        for (const path of files.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs)) {
          if (total <= 40 * 1024 * 1024) break;
          if (path === file) continue;
          total -= this.size(path); rmSync(path, { force: true });
        }
      }
      this.emit(entry);
    }
  }
  read(service?: string) { return this.entries.filter(entry => !service || entry.service === service).slice(-1000); }
  finish() { rmSync(join(this.directory, 'active'), { force: true }); }
  private size(file: string): number { try { return statSync(file).size; } catch { return 0; } }
  private prune(root: string) {
    const directory = join(root, 'logs');
    const sessions = readdirSync(directory).filter(name => statSync(join(directory, name)).isDirectory()).sort().reverse();
    let total = 0;
    for (const [i, name] of sessions.entries()) {
      const path = join(directory, name);
      total += readdirSync(path).reduce((n, file) => n + this.size(join(path, file)), 0);
      if (path !== this.directory && (i >= 10 || total > 450 * 1024 * 1024)) rmSync(path, { recursive: true, force: true });
    }
  }
}

export function readLogFile(file: string): LogEntry[] {
  try { return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line) as LogEntry]; } catch { return []; } }); } catch { return []; }
}
