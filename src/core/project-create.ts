import { realpath, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

export async function coveredBySearchRoot(directory: string, roots: string[]): Promise<boolean> {
  const path = await realpath(directory);
  for (const root of roots) {
    const canonicalRoot = await realpath(root).catch(() => root);
    const child = relative(canonicalRoot, path);
    if (child === '' || (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child))) return true;
  }
  return false;
}

export async function createProjectConfig(directory: string): Promise<string> {
  const path = await realpath(directory);
  if (!(await stat(path)).isDirectory()) throw new Error('Choose a project folder.');
  const file = join(path, 'devenv.toml');
  try { await writeFile(file, '', { flag: 'wx', mode: 0o644 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('This folder already contains devenv.toml. The existing file was left unchanged.');
    throw error;
  }
  return file;
}
