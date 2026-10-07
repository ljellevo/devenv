import { ownedCommand } from './platform';
import { EventEmitter } from 'node:events';
import { readFile, stat } from 'node:fs/promises';
import { parse } from 'dotenv';
import * as pty from 'node-pty';
import { loadProject } from './config';
import { readInstallRecord, writeInstallRecord, type InstallRecord } from './install-record';
import { message, signalGroup, stopGroup, runCommand } from './process';
import type { InstallConfig, InstallState, InstallStep } from '../shared/types';

export class Installer extends EventEmitter {
  state: InstallState | null = null;
  private terminal?: pty.IPty;
  private cancelled = false;
  private abort?: AbortController;
  private active?: Promise<void>;
  constructor(private shell: string, private env: NodeJS.ProcessEnv, private stopSession: () => Promise<unknown>) { super(); }
  configure(shell: string, env: NodeJS.ProcessEnv) { this.shell = shell; this.env = env; }
  private update(state: InstallState | null) { this.state = state; this.emit('state', state); }
  private output(text: string) { this.emit('output', text); }
  async check(file: string): Promise<boolean> {
    const project = await loadProject(file);
    if (!project.install) return true;
    const record = await readInstallRecord(file, project.install.recipeHash);
    if (!project.install.check_command) return !!record?.installed;
    const result = await this.runCheck(project.install);
    if (!result) {
      if (record?.installed) await writeInstallRecord(file, { ...record, installed: false });
      return false;
    }
    if (!record?.installed) await writeInstallRecord(file, { version: 1, recipeHash: project.install.recipeHash, completedStepIds: project.install.steps.map(s => s.id), installed: true });
    return true;
  }
  private async runCheck(config: InstallConfig): Promise<boolean> {
    if (!(await stat(config.cwd).catch(() => null))?.isDirectory()) return false;
    try { return (await runCommand(config.check_command!, { cwd: config.cwd } as import('../shared/types').ServiceConfig, this.shell, this.env, 30000, this.abort?.signal)).code === 0; }
    catch { return false; }
  }
  install(file: string, mode: 'resume' | 'restart'): Promise<void> {
    if (this.active) throw new Error('An installation is already running.');
    this.cancelled = false; this.abort = new AbortController();
    const task = this.runInstall(file, mode);
    this.active = task;
    return task.finally(() => { this.active = undefined; });
  }
  private async runInstall(file: string, mode: 'resume' | 'restart') {
    const project = await loadProject(file);
    if (!project.install) throw new Error('This project has no install recipe.');
    const config = project.install;
    const old = mode === 'resume' ? await readInstallRecord(file, config.recipeHash) : null;
    const completed = mode === 'resume' && old && !old.installed ? [...old.completedStepIds] : [];
    this.update({ projectId: project.id, status: 'running', completedStepIds: completed });
    try {
      // Check before disturbing another project; explicit reinstall always runs every step.
      if (mode === 'resume' && !old && config.check_command && await this.runCheck(config)) {
        await writeInstallRecord(file, { version: 1, recipeHash: config.recipeHash, completedStepIds: config.steps.map(s => s.id), installed: true });
        this.update({ projectId: project.id, status: 'completed', completedStepIds: config.steps.map(s => s.id) }); return;
      }
      if (this.cancelled) throw new Error('Installation cancelled');
      await this.stopSession();
      await writeInstallRecord(file, { version: 1, recipeHash: config.recipeHash, completedStepIds: completed, installed: false });
      for (let index = 0; index < config.steps.length; index++) {
        const step = config.steps[index];
        if (completed.includes(step.id)) continue;
        if (this.cancelled) throw new Error('Installation cancelled');
        this.update({ projectId: project.id, status: 'running', stepId: step.id, stepIndex: index, completedStepIds: [...completed], notes: step.notes });
        this.output(`\r\n[devenv] ${index + 1}/${config.steps.length} · ${step.id}: ${step.command}\r\n`);
        await this.runStep(step);
        completed.push(step.id);
        await writeInstallRecord(file, { version: 1, recipeHash: config.recipeHash, completedStepIds: completed, installed: false });
      }
      if (config.check_command && !(await this.runCheck(config))) throw new Error('Installation steps finished, but check_command did not confirm the project is installed.');
      const record: InstallRecord = { version: 1, recipeHash: config.recipeHash, completedStepIds: completed, installed: true };
      await writeInstallRecord(file, record);
      this.update({ projectId: project.id, status: 'completed', completedStepIds: completed });
      this.output('\r\n[devenv] Installation complete. Run project when ready.\r\n');
    } catch (error) {
      const reason = message(error);
      this.update({ projectId: project.id, status: this.cancelled ? 'cancelled' : 'failed', stepId: completed.length < config.steps.length ? this.state?.stepId : undefined, stepIndex: completed.length < config.steps.length ? this.state?.stepIndex : undefined, completedStepIds: completed, error: reason, notes: completed.length < config.steps.length ? this.state?.notes : undefined });
      this.output(`\r\n[devenv] ${reason}\r\n`);
      throw error;
    }
  }
  private async runStep(step: InstallStep) {
    if (!(await stat(step.cwd).catch(() => null))?.isDirectory()) throw new Error(`${step.id}: directory does not exist: ${step.cwd}`);
    const fileEnv = step.env_file ? parse(await readFile(step.env_file)) : {};
    const env = { ...this.env, ...fileEnv, ...step.env, TERM: 'xterm-256color' } as Record<string, string>;
    const [file, args] = ownedCommand(this.shell, step.command, step.interactive);
    const terminal = pty.spawn(file, args, { cwd: step.cwd, env, cols: 100, rows: 30, name: 'xterm-256color' });
    this.terminal = terminal;
    try {
      const code = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => { try { signalGroup(terminal.pid, 'SIGKILL'); terminal.kill('SIGKILL'); reject(new Error(`${step.id}: timed out after ${step.timeout}s`)); } catch (error) { reject(error); } }, step.timeout * 1000);
        const data = terminal.onData(text => this.output(text));
        terminal.onExit(({ exitCode }) => { clearTimeout(timer); data.dispose(); resolve(exitCode); });
      });
      if (this.cancelled) throw new Error('Installation cancelled');
      if (code !== 0) throw new Error(`${step.id}: exited with code ${code}`);
    } finally { this.terminal = undefined; await stopGroup(terminal.pid, 250); }
  }
  input(data: string) { if (!this.terminal) throw new Error('No interactive installation step is running.'); this.terminal.write(data); }
  resize(cols: number, rows: number) { this.terminal?.resize(cols, rows); }
  cancel() { this.cancelled = true; this.abort?.abort(); if (this.terminal) { signalGroup(this.terminal.pid, 'SIGKILL'); this.terminal.kill('SIGKILL'); } }
  async shutdown() { this.cancel(); await this.active?.catch(() => {}); }
}
