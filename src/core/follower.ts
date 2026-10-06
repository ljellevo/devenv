import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readLogFile } from './logs';
const [directory, service] = process.argv.slice(2);
if (!directory || !service || !/^[\w-]+$/.test(service)) process.exit(1);
let last = 0;
let signature = '';
function poll() {
  const file = join(directory, `${service}.jsonl`);
  const currentSignature = [file + '.1', file].map(path => { try { const s = statSync(path); return `${s.ino}:${s.size}:${s.mtimeMs}`; } catch { return ''; } }).join('|');
  if (currentSignature !== signature) {
    signature = currentSignature;
    for (const entry of [...readLogFile(file + '.1'), ...readLogFile(file)]) {
      if (entry.seq <= last) continue;
      process.stdout.write(entry.text); last = entry.seq;
    }
  }
  if (!existsSync(join(directory, 'active'))) { console.log('\n[devenv session ended]'); process.exit(0); }
}
console.log(`[devenv · ${service}] Ctrl-C closes this viewer; services stay running.\n`);
poll(); setInterval(poll, 350);
