import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultShell, powershellQuote } from '../src/core/platform';
import { launch, stopGroup, alive, delay, runCommand } from '../src/core/process';
import type { ServiceConfig } from '../src/shared/types';
// Fixtures spawn grandchildren with detached:true. Otherwise Node's own kill-on-close job ends them when their
// node parent exits, and these tests would pass (or race) without Devenv's Job Object doing anything.
describe.skipIf(process.platform !== 'win32')('Windows Job Object lifecycle', () => {
  it('awaits descendant cleanup after stopping the owned command', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'devenv-job-'));
    const script = "const fs=require('fs');const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});fs.writeFileSync('child',String(c.pid));setInterval(()=>{},1000)";
    const child = launch(`& ${powershellQuote(process.execPath)} -e ${powershellQuote(script)}`, cwd, await defaultShell(), process.env);
    try {
      let descendant = 0;
      for (let attempt = 0; attempt < 100 && !descendant; attempt++) { descendant = Number(await readFile(join(cwd, 'child'), 'utf8').catch(() => '0')); await delay(100); }
      expect(descendant).toBeGreaterThan(1); expect(alive(descendant)).toBe(true);
      await stopGroup(child.pid!, 1000); expect(alive(descendant)).toBe(false);
    } finally { if (child.pid) await stopGroup(child.pid, 1000); await rm(cwd, { recursive: true, force: true }); }
  }, 20000);
  it('times out a command and its descendants', async () => {
    const result = await runCommand('Start-Sleep -Seconds 60', { cwd: tmpdir() } as ServiceConfig, await defaultShell(), process.env, 1000);
    expect(result.code).not.toBe(0);
  }, 15000);
});

describe.skipIf(process.platform !== 'win32')('Windows early parent exit', () => {
  it('cleans descendants even when their original parent exits first', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'devenv-early-'));
    const script = "const fs=require('fs');const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});fs.writeFileSync('child',String(c.pid));c.unref()";
    try {
      const result = await runCommand(`& ${powershellQuote(process.execPath)} -e ${powershellQuote(script)}`, { cwd } as ServiceConfig, await defaultShell(), process.env, 10000);
      expect(result.code).toBe(0);
      const descendant = Number(await readFile(join(cwd, 'child'), 'utf8'));
      expect(alive(descendant)).toBe(false);
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }, 20000);
});

describe.skipIf(process.platform !== 'win32')('Windows installation PTY', () => {
  it('accepts interactive input and records completion', async () => {
    const { Installer } = await import('../src/core/installer');
    const { writeFile } = await import('node:fs/promises');
    const cwd = await mkdtemp(join(tmpdir(), 'devenv-pty-'));
    const file = join(cwd, 'devenv.toml');
    const installer = new Installer(await defaultShell(), process.env, async () => {});
    await writeFile(file, 'version=1\nname="Windows PTY"\n[services.app]\ncommand="Write-Output ready"\n[install]\n[[install.steps]]\nid="input"\ninteractive=true\ncommand="if ((Read-Host \'Answer\') -ne \'yes\') { exit 1 }"\n');
    let sent = false;
    installer.on('output', text => { if (!sent && String(text).includes('Answer:')) { sent = true; installer.input('yes\r'); } });
    try { await installer.install(file, 'resume'); expect(sent).toBe(true); expect(installer.state?.status).toBe('completed'); }
    finally { await installer.shutdown(); await rm(cwd, { recursive: true, force: true }); }
  }, 20000);
});

describe.skipIf(process.platform !== 'win32')('Windows background launchers', () => {
  it('retains a detached child until explicit stop', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'devenv-background-'));
    const script = "const fs=require('fs');const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});fs.writeFileSync('child',String(c.pid));c.unref()";
    const child = launch(`& ${powershellQuote(process.execPath)} -e ${powershellQuote(script)}`, cwd, await defaultShell(), process.env, true);
    try {
      const code = await new Promise<number>((resolve, reject) => { child.once('command-exit', resolve); child.once('error', reject); });
      expect(code).toBe(0);
      const descendant = Number(await readFile(join(cwd, 'child'), 'utf8'));
      expect(alive(descendant)).toBe(true);
      await stopGroup(child.pid!, 1000);
      expect(alive(descendant)).toBe(false);
      // The helper retaining the Job must be gone too, or it still holds the working directory.
      expect(alive(child.pid!)).toBe(false);
    } finally { await stopGroup(child.pid!, 1000); await rm(cwd, { recursive: true, force: true }); }
  }, 20000);
});
