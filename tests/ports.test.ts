import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProcessIdentity } from '../src/core/process';
const mocks = vi.hoisted(() => ({ exec: vi.fn(), processes: vi.fn(), identity: vi.fn(), stopGroup: vi.fn(), delay: vi.fn() }));
vi.mock('../src/core/process', () => ({ ...mocks, sameProcess: (a: ProcessIdentity, b: ProcessIdentity) => a.pid === b?.pid && a.started === b?.started && a.pgid === b?.pgid }));
import { MacPorts } from '../src/core/ports';
const owner: ProcessIdentity = { pid: 450, pgid: 440, ppid: 440, started: 'now', command: 'node server.js' };
beforeEach(() => { vi.resetAllMocks(); mocks.delay.mockResolvedValue(undefined); mocks.stopGroup.mockResolvedValue(undefined); mocks.identity.mockResolvedValue(owner); });
describe('port ownership boundary', () => {
  it('stops a watcher group and verifies its listener is gone', async () => {
    let listening = true;
    mocks.exec.mockImplementation(async (binary: string) => {
      if (binary === 'docker') throw new Error('Docker not installed');
      if (listening) return { stdout: '450\n' };
      throw Object.assign(new Error(), { code: 1 });
    });
    mocks.processes.mockResolvedValue([owner, { ...owner, pid: 440, command: '/bin/sh -c npm run dev' }]);
    mocks.stopGroup.mockImplementation(async () => { listening = false; });
    const log = vi.fn(); await new MacPorts().reclaim([3100], log);
    expect(mocks.stopGroup).toHaveBeenCalledWith(440, 15000); expect(log).toHaveBeenCalledWith(expect.stringContaining('Reclaiming 3100'));
  });
  it.each(['-zsh', '/bin/bash', '/Applications/Docker.app/com.docker.backend'])('refuses a group containing protected process %s', async command => {
    mocks.exec.mockImplementation(async (binary: string) => { if (binary === 'docker') throw new Error(); return { stdout: '450\n' }; });
    mocks.processes.mockResolvedValue([owner, { ...owner, pid: 440, command }]);
    await expect(new MacPorts().reclaim([3100], () => {})).rejects.toThrow('protected process');
    expect(mocks.stopGroup).not.toHaveBeenCalled();
  });
  it('matches Docker host bindings and does not kill Docker Desktop', async () => {
    mocks.exec.mockImplementation(async (binary: string, args: string[]) => {
      if (binary !== 'docker') throw Object.assign(new Error(), { code: 1 });
      if (args[0] === 'ps') return { stdout: 'aaa\nbbb\n' };
      if (args[0] === 'inspect') return { stdout: JSON.stringify([
        { Id: 'aaa', Name: '/other-postgres', NetworkSettings: { Ports: { '5432/tcp': [{ HostPort: '5433' }] } } },
        { Id: 'bbb', Name: '/unrelated', NetworkSettings: { Ports: { '5433/tcp': [{ HostPort: '9999' }] } } },
      ]) };
      return { stdout: '' };
    });
    await new MacPorts().reclaim([5433], () => {});
    expect(mocks.exec).toHaveBeenCalledWith('docker', ['stop', '--time', '15', 'aaa'], expect.anything());
    expect(mocks.exec).not.toHaveBeenCalledWith('docker', ['stop', '--time', '15', 'bbb'], expect.anything());
    expect(mocks.stopGroup).not.toHaveBeenCalled();
  });
  it('blocks startup when a listener respawns after reclamation', async () => {
    mocks.exec.mockImplementation(async binary => { if (binary === 'docker') throw new Error(); return { stdout: '450\n' }; });
    mocks.processes.mockResolvedValue([owner]);
    await expect(new MacPorts().reclaim([3100], () => {})).rejects.toThrow('still occupied');
  });
});
