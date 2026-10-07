import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { WslClient, distributions, translatePath } from '../src/core/wsl';
import { exec, quote } from '../src/core/process';
import type { Project, ConfigDocument } from '../src/shared/types';

const enabled = process.env.DEVENV_TEST_WSL === '1';
const distribution = process.env.DEVENV_WSL_TEST_DISTRO || 'Devenv-Test';
const version = process.env.DEVENV_TEST_VERSION || '0.1.0';
const client = () => new WslClient(distribution, resolve('dist/companion-linux-x64.tar.gz'), version);
const linux = async (command: string) => (await exec('wsl.exe', ['--distribution', distribution, '--exec', '/bin/sh', '-c', command], { timeout: 30000 })).stdout.trim();
describe.skipIf(!enabled)('prepared WSL 2 integration', () => {
  it('discovers, edits, installs, starts, stops, and disconnects a Linux fixture', async () => {
    if (process.platform !== 'win32') throw new Error('WSL release checks require a Windows runner');
    expect((await distributions()).find(item => item.name === distribution)?.version).toBe(2);
    const path = await linux('mktemp -d');
    const config = `version=1\nname="WSL fixture"\n[services.app]\ncommand={linux="sleep 60 & wait",windows="exit 9"}\n[install]\ncheck_command="test -f installed"\n[[install.steps]]\nid="setup"\ncommand="touch installed"\n`;
    const remote = client();
    try {
      await linux(`printf '%s' ${quote(config)} > ${quote(path + '/devenv.toml')}`);
      await remote.connect();
      const found = await remote.request<{ projects: Project[] }>('discover', JSON.stringify({ roots: [path], exclusions: [] }));
      expect(found.projects).toHaveLength(1); expect(found.projects[0].services[0].command).toBe('sleep 60 & wait');
      expect(found.projects[0].executionTarget).toEqual({ kind: 'wsl', distribution });
      const file = path + '/devenv.toml';
      const document = await remote.request<ConfigDocument>('read-config', file);
      await remote.request('save-config', JSON.stringify({ path: file, text: config.replace('WSL fixture', 'Edited fixture'), revision: document.revision }));
      await remote.request('install', JSON.stringify({ path: file, mode: 'resume' }));
      await remote.request('start', file);
      await remote.request('stop');
      expect(await linux(`test -f ${quote(path + '/installed')} && printf yes`)).toBe('yes');
      expect(await translatePath(distribution, resolve('package.json'))).toMatch(/^\//);
    } finally { await remote.close(); await linux(`rm -rf -- ${quote(path)}`); }
  }, 180000);
  it('rejects a missing distribution without executing on Windows', async () => {
    await expect(new WslClient('Devenv-Does-Not-Exist', resolve('dist/companion-linux-x64.tar.gz'), version).connect()).rejects.toThrow('unavailable');
  });
});

describe.skipIf(!enabled)('WSL failure cleanup', () => {
  it('cleans owned processes when the Windows RPC connection closes', async () => {
    const path = await linux('mktemp -d');
    const config = 'version=1\nname="Disconnect fixture"\n[services.app]\ncommand="echo $$ > pid; sleep 60 & wait"\n';
    const remote = client();
    let pid = 0;
    try {
      await linux(`printf '%s' ${quote(config)} > ${quote(path + '/devenv.toml')}`);
      await remote.request('start', path + '/devenv.toml');
      pid = Number(await linux(`cat ${quote(path + '/pid')}`));
      const transport = (remote as unknown as { child: import('node:child_process').ChildProcess }).child;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Companion did not exit on disconnect')), 20000);
        transport.once('exit', () => { clearTimeout(timer); resolve(); }); transport.stdin!.end();
      });
      expect(await linux(`if kill -0 ${pid} 2>/dev/null; then printf alive; else printf stopped; fi`)).toBe('stopped');
    } finally { await remote.close(); await linux(`rm -rf -- ${quote(path)}`); }
  }, 180000);
  it('reports distribution termination and recovers on reconnect', async () => {
    // Only an explicitly prepared disposable distribution may be terminated by this test.
    if (!distribution.startsWith('Devenv-Test')) throw new Error('Distribution-termination tests require a disposable Devenv-Test distribution');
    const remote = client();
    await remote.connect();
    const exited = new Promise<void>(resolve => remote.once('failure', () => resolve()));
    await exec('wsl.exe', ['--terminate', distribution], { timeout: 30000 });
    await exited;
    // The next request starts a fresh companion in the restarted distribution.
    try { expect((await remote.request<{ path: string }>('directories')).path).toMatch(/^\//); }
    finally { await remote.close(); }
  }, 180000);
});
