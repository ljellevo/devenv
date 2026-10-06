import { readFile, stat, realpath, readdir } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import TOML from '@iarna/toml';
import { z } from 'zod';
import type { Project, ServiceConfig } from '../shared/types';

const command = z.string().trim().min(1);
const serviceSchema = z.object({
  cwd: z.string().default('.'), command, ports: z.array(z.number().int().min(1).max(65535)).default([]),
  depends_on: z.array(z.string()).default([]), mode: z.enum(['process', 'task', 'background']).default('process'),
  enabled: z.boolean().default(true), env: z.record(z.string()).default({}), env_file: z.string().optional(),
  ready_command: command.optional(), stop_command: command.optional(), logs_command: command.optional(),
  startup_timeout: z.number().positive().max(86400).default(60), stop_timeout: z.number().positive().max(300).default(15),
  allow_successful_exit: z.boolean().default(false),
}).strict();
const schema = z.object({ version: z.literal(1), name: command, services: z.record(serviceSchema) }).strict();

export async function loadProject(file: string): Promise<Project> {
  const path = await realpath(file);
  return validateProjectText(path, await readFile(path, 'utf8'));
}

export async function validateProjectText(file: string, text: string): Promise<Project> {
  const path = await realpath(file);
  const data = schema.parse(TOML.parse(text));
  const services: ServiceConfig[] = [];
  for (const [name, config] of Object.entries(data.services)) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) throw new Error(`Invalid service name: ${name}. Use letters, digits, - or _.`);
    const cwd = resolve(dirname(path), config.cwd);
    const env_file = config.env_file ? resolve(dirname(path), config.env_file) : undefined;
    if (config.enabled) {
      if (!(await stat(cwd).catch(() => null))?.isDirectory()) throw new Error(`${name}: directory does not exist: ${cwd}`);
      if (env_file && !(await stat(env_file).catch(() => null))?.isFile()) throw new Error(`${name}: environment file does not exist: ${env_file}`);
      if (config.mode === 'background' && (!config.stop_command || !config.ready_command)) throw new Error(`${name}: background services require stop_command and ready_command`);
      if (config.mode === 'task' && (config.ready_command || config.ports.length)) throw new Error(`${name}: tasks cannot declare readiness or listening ports`);
    }
    services.push({ ...config, name, cwd, env_file });
  }
  if (!services.some(s => s.enabled)) throw new Error('The project has no enabled services');
  const enabled = services.filter(s => s.enabled);
  const ports = new Map<number, string>();
  for (const service of enabled) {
    for (const port of service.ports) {
      if (ports.has(port)) throw new Error(`Port ${port} declared more than once (${ports.get(port)}, ${service.name})`);
      ports.set(port, service.name);
    }
    for (const dependency of service.depends_on) {
      if (!enabled.some(s => s.name === dependency)) throw new Error(`${service.name}: dependency '${dependency}' is missing or disabled`);
    }
  }
  dependencyOrder(enabled);
  return { id: projectId(path), path, name: data.name, services };
}

export const projectId = (path: string) => createHash('sha256').update(path).digest('hex').slice(0, 20);

export function dependencyOrder(services: ServiceConfig[]): ServiceConfig[] {
  const result: ServiceConfig[] = [], visited = new Set<string>(), visiting = new Set<string>();
  function visit(service: ServiceConfig) {
    if (visiting.has(service.name)) throw new Error(`Dependency cycle involving ${service.name}`);
    if (visited.has(service.name)) return;
    visiting.add(service.name);
    for (const name of service.depends_on) {
      const dep = services.find(s => s.name === name);
      if (!dep) throw new Error(`Missing dependency ${name}`);
      visit(dep);
    }
    visiting.delete(service.name); visited.add(service.name); result.push(service);
  }
  services.forEach(visit); return result;
}

export const DEFAULT_EXCLUSIONS = ['.git', 'node_modules', '.pnpm-store', 'vendor', '.venv', 'venv', '__pycache__', 'dist', 'build', 'release', 'target', '.next', '.nuxt', '.cache', '.turbo', 'coverage', 'Library', 'Pods', 'DerivedData'];

export async function discover(roots: string[], exclusions: string[] = []): Promise<{ projects: Project[]; errors: string[] }> {
  const seen = new Set<string>(), projects: Project[] = [], errors: string[] = [];
  const skipped = new Set([...DEFAULT_EXCLUSIONS, ...exclusions]);
  async function walk(directory: string) {
    let path: string;
    try { path = await realpath(directory); } catch (error) { errors.push(`${directory}: ${String(error)}`); return; }
    if (seen.has(path)) return;
    seen.add(path);
    let entries;
    try { entries = await readdir(path, { withFileTypes: true }); } catch (error) { errors.push(`${path}: ${String(error)}`); return; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const child = resolve(path, entry.name);
      if (entry.isDirectory() && !skipped.has(entry.name) && !entry.name.endsWith('.app')) await walk(child);
      else if (entry.isFile() && entry.name === 'devenv.toml') {
        try { projects.push(await loadProject(child)); }
        catch (error) { projects.push({ id: projectId(child), path: child, name: basename(dirname(child)), services: [], error: error instanceof Error ? error.message : String(error) }); }
      }
    }
  }
  for (const root of roots) await walk(root);
  return { projects: projects.sort((a, b) => a.name.localeCompare(b.name)), errors };
}
