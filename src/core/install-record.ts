import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { InstallConfig } from '../shared/types';

export interface InstallRecord { version: 1; recipeHash: string; completedStepIds: string[]; installed: boolean }
export const recipeHash = (config: Omit<InstallConfig, 'recipeHash'>) => createHash('sha256').update(JSON.stringify({ cwd: config.cwd, check_command: config.check_command, steps: config.steps.map(({ notes: _notes, ...step }) => step) })).digest('hex');
const recordPath = (file: string) => join(dirname(file), '.devenv', 'install.json');

export async function readInstallRecord(file: string, hash: string): Promise<InstallRecord | null> {
  try {
    const value = JSON.parse(await readFile(recordPath(file), 'utf8')) as InstallRecord;
    if (value.version !== 1 || value.recipeHash !== hash || !Array.isArray(value.completedStepIds) || typeof value.installed !== 'boolean') return null;
    return value;
  } catch { return null; }
}

export async function writeInstallRecord(file: string, record: InstallRecord): Promise<void> {
  const directory = join(dirname(file), '.devenv');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const ignorePath = join(dirname(file), '.gitignore');
  let ignore = await readFile(ignorePath, 'utf8').catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  });
  if (!ignore.split(/\r?\n/).some(line => line.trim() === '.devenv/')) {
    ignore += `${ignore && !ignore.endsWith('\n') ? '\n' : ''}.devenv/\n`;
    await writeFile(ignorePath, ignore);
  }
  const temporary = join(directory, `install.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, recordPath(file));
}
