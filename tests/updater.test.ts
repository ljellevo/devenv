import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { Updater, compareVersions, pickAsset } from '../src/core/updater';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function create(request: typeof fetch) { const root = await mkdtemp(join(tmpdir(), 'devenv-update-')); roots.push(root); return { root, updater: new Updater(root, '0.1.0', 'arm64', () => {}, request, 'macos') }; }
describe('assisted updater', () => {
  it('compares stable versions and never installs a mismatched architecture', () => {
    expect(compareVersions('v1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(() => compareVersions('v1.0.1-beta', '1.0.0')).toThrow();
    expect(pickAsset([{ id: 1, name: 'Devenv-1.0.0-x64.dmg', size: 2 }], 'arm64')).toBeUndefined();
  });
  it('checks public releases, downloads with a checksum, and sends API headers only to GitHub', async () => {
    const body = Buffer.from('installer'), requests: Array<{ url: string; options?: RequestInit }> = [];
    const digest = 'sha256:' + createHash('sha256').update(body).digest('hex');
    const { root, updater } = await create((async (input, options) => {
      const url = String(input); requests.push({ url, options });
      if (url.endsWith('/latest')) return Response.json({ tag_name: 'v0.2.0', assets: [{ id: 4, name: 'Devenv-0.2.0-arm64.dmg', size: body.length, digest }] });
      if (url.includes('/assets/')) return new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/first-hop' } });
      if (url.endsWith('/first-hop')) return new Response(null, { status: 302, headers: { location: 'https://objects.githubusercontent.com/installer' } });
      return new Response(body);
    }) as typeof fetch);
    await updater.check('ljellevo/devenv'); expect(updater.state.status).toBe('available');
    expect(updater.state.checkedAt).toEqual(expect.any(String));
    const file = await updater.download('ljellevo/devenv'); expect(await readFile(file)).toEqual(body);
    expect(requests[1].options?.headers).toHaveProperty('Accept', 'application/octet-stream');
    expect(requests[2].options?.headers).toBeUndefined();
    expect(requests[3].options?.headers).toBeUndefined();
    expect(file.startsWith(root)).toBe(true);
  });
  it('rejects incomplete downloads and unsafe redirects', async () => {
    const { updater } = await create((async input => String(input).endsWith('/latest') ? Response.json({ tag_name: 'v0.2.0', assets: [{ id: 4, name: 'Devenv-0.2.0-arm64.dmg', size: 8 }] }) : new Response(null, { status: 302, headers: { location: 'https://example.com/installer' } })) as typeof fetch);
    await updater.check('ljellevo/devenv'); await expect(updater.download('ljellevo/devenv')).rejects.toThrow('Unexpected asset redirect');
  });
  it('reports missing releases and rejects repo changes between check and download', async () => {
    const { updater } = await create((async () => new Response(null, { status: 404 })) as typeof fetch);
    await updater.check('ljellevo/devenv'); expect(updater.state).toMatchObject({ status: 'error', message: 'No release found for this repository.' });
    await expect(updater.download('other/repo')).rejects.toThrow('Check for updates');
  });
});
