import { readFile, realpath, stat, writeFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validateProjectText } from './config';
import type { ConfigDocument } from '../shared/types';

const MAX_BYTES = 1024 * 1024;
const revision = (text: string) => createHash('sha256').update(text).digest('hex');

export async function readConfigDocument(path: string): Promise<ConfigDocument> {
  if (basename(path) !== 'devenv.toml' || await realpath(path) !== path) throw new Error('Configuration path changed. Refresh the project list.');
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_BYTES) throw new Error('Configuration must be a regular file smaller than 1 MB.');
  const text = await readFile(path, 'utf8');
  return { path, text, revision: revision(text) };
}

export async function saveConfigDocument(path: string, text: string, expectedRevision: string): Promise<ConfigDocument> {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES) throw new Error('Configuration must be smaller than 1 MB.');
  if (!/^[a-f0-9]{64}$/.test(expectedRevision)) throw new Error('Invalid configuration revision. Reload the file.');
  const initial = await readConfigDocument(path);
  if (initial.revision !== expectedRevision) throw new Error('The configuration changed on disk. Reload it before saving.');
  await validateProjectText(path, text);
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    const info = await stat(path);
    await writeFile(temp, text, { mode: info.mode & 0o777, flag: 'wx' });
    const current = await readConfigDocument(path);
    if (current.revision !== expectedRevision) throw new Error('The configuration changed on disk. Reload it before saving.');
    await rename(temp, path);
    return { path, text, revision: revision(text) };
  } finally { await rm(temp, { force: true }); }
}
