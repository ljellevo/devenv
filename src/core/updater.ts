import { mkdir, readFile, writeFile, rename, rm, open } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { UpdateInfo } from '../shared/types';

interface Asset { id: number; name: string; size: number; digest?: string }
interface Release { tag_name: string; body?: string; draft?: boolean; prerelease?: boolean; assets: Asset[] }
export function compareVersions(a: string, b: string): number {
  const parse = (s: string) => {
    if (!/^v?\d+\.\d+\.\d+$/.test(s)) throw new Error(`Unsupported stable version: ${s}`);
    return s.replace(/^v/, '').split('.').map(Number);
  };
  const aa = parse(a), bb = parse(b);
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return Math.sign(aa[i] - bb[i]);
  return 0;
}
export function pickAsset(assets: Asset[], arch: string) {
  return assets.find(a => a.name.toLowerCase().endsWith('.dmg') && (a.name.includes(`-${arch}.`) || a.name.includes('-universal.')));
}
export class Updater {
  state: UpdateInfo;
  private asset?: Asset;
  private checkedRepo?: string;
  private busy = false;
  constructor(private root: string, readonly current: string, private arch: string, private emit: (state: UpdateInfo) => void, private request: typeof fetch = fetch) {
    this.state = { status: 'idle', current };
  }
  private set(state: Partial<UpdateInfo>) { this.state = { current: this.current, ...state } as UpdateInfo; this.emit(this.state); }
  private async token(): Promise<string | undefined> {
    try { return (JSON.parse(await readFile(join(this.root, 'updates.json'), 'utf8')) as { token?: string }).token; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  }
  async hasToken() { return !!(await this.token()); }
  async saveToken(value: string) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    // Matches Oppskriftsbanken's ad-hoc signed app: local file, no recurring Keychain prompts.
    await writeFile(join(this.root, 'updates.tmp'), JSON.stringify({ token: value.trim() || undefined }), { mode: 0o600 });
    await rename(join(this.root, 'updates.tmp'), join(this.root, 'updates.json'));
  }
  private async headers(accept: string) {
    const token = await this.token();
    return { 'User-Agent': 'Devenv', 'X-GitHub-Api-Version': '2022-11-28', Accept: accept, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  }
  async check(repo: string) {
    if (this.busy) return;
    this.busy = true; this.asset = undefined;
    this.set({ status: 'checking' });
    try {
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Set a release repository in owner/name format.');
      const response = await this.request(`https://api.github.com/repos/${repo}/releases/latest`, { headers: await this.headers('application/vnd.github+json'), signal: AbortSignal.timeout(20000), redirect: 'error' });
      if ([401, 403, 404].includes(response.status)) {
        const token = await this.hasToken();
        this.set({ status: !token ? 'needsToken' : 'error', message: response.status === 404 ? 'No release found, or this private repository needs a token with Contents read access.' : 'GitHub rejected the request. Check token permissions or rate limits.' }); return;
      }
      if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
      const release = await response.json() as Release;
      if (release.draft || release.prerelease) throw new Error('Only stable releases are supported.');
      if (compareVersions(release.tag_name, this.current) <= 0) { this.set({ status: 'uptodate', latest: release.tag_name }); return; }
      const asset = pickAsset(release.assets, this.arch);
      if (!asset || !Number.isSafeInteger(asset.id) || !asset.size || basename(asset.name) !== asset.name) throw new Error(`Release has no valid ${this.arch} DMG installer.`);
      this.asset = asset; this.checkedRepo = repo;
      this.set({ status: 'available', latest: release.tag_name, notes: release.body });
    } catch (error) { this.set({ status: 'error', message: error instanceof Error ? error.message : String(error) }); }
    finally { this.busy = false; }
  }
  async download(repo: string): Promise<string> {
    if (this.busy || !this.asset || this.checkedRepo !== repo) throw new Error('Check for updates before downloading.');
    this.busy = true;
    const asset = this.asset, latest = this.state.latest;
    const directory = join(this.root, 'updates');
    const dest = join(directory, asset.name), partial = dest + '.partial';
    this.set({ status: 'downloading', latest, progress: 0 });
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      let response = await this.request(`https://api.github.com/repos/${repo}/releases/assets/${asset.id}`, { headers: await this.headers('application/octet-stream'), redirect: 'manual', signal: AbortSignal.timeout(30000) });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('GitHub did not return an asset URL.');
        const url = new URL(location);
        if (url.protocol !== 'https:' || !(url.hostname.endsWith('.githubusercontent.com') || url.hostname === 'github.com')) throw new Error('Unexpected asset redirect host.');
        // Never forward the repository token to the signed download URL.
        response = await this.request(url, { redirect: 'error', signal: AbortSignal.timeout(600000) });
      }
      if (!response.ok || !response.body) throw new Error(`Download failed (HTTP ${response.status})`);
      const handle = await open(partial, 'w', 0o600);
      let received = 0; const hash = createHash('sha256');
      try {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          received += value.length;
          if (received > asset.size) { await reader.cancel(); throw new Error('Installer size differs from the release metadata.'); }
          hash.update(value); await handle.writeFile(value);
          this.set({ status: 'downloading', latest, progress: Math.floor(received / asset.size * 100) });
        }
      } finally { await handle.close(); }
      if (received !== asset.size) throw new Error('Installer download was incomplete.');
      const digest = hash.digest('hex');
      if (asset.digest?.startsWith('sha256:') && asset.digest.slice(7) !== digest) throw new Error('Installer checksum verification failed.');
      await rename(partial, dest);
      this.set({ status: 'downloaded', latest, progress: 100 }); return dest;
    } catch (error) {
      await rm(partial, { force: true }); this.set({ status: 'error', message: error instanceof Error ? error.message : String(error) }); throw error;
    } finally { this.busy = false; }
  }
}
