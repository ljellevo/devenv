import { expect, test } from 'vitest';
import { projectSetupPrompt } from '../src/shared/project-prompt';

test('agent prompt includes the selected file and Devenv service rules', () => {
  const prompt = projectSetupPrompt('/Users/developer/work/my app/devenv.toml');
  expect(prompt).toContain('/Users/developer/work/my app/devenv.toml');
  expect(prompt).toContain('version = 1');
  expect(prompt).toContain('[services.<name>]');
  expect(prompt).toContain('relative to devenv.toml');
  expect(prompt).toContain('ready_command and stop_command');
  expect(prompt).toContain('Do not put placeholder services');
});


test('setup prompt explains one-file overrides and the selected WSL execution context', () => {
  const prompt = projectSetupPrompt('/home/me/app/devenv.toml', { host: 'windows', target: { kind: 'wsl', distribution: 'Ubuntu-24.04' } });
  expect(prompt).toContain('Keep one devenv.toml');
  expect(prompt).toContain('Desktop host: windows. Project execution platform: linux (WSL 2 distribution: Ubuntu-24.04)');
  expect(prompt).toContain('ready_command, stop_command, logs_command, install.check_command');
  expect(prompt).toContain('exact key wins over default');
  expect(prompt).toContain('inline maps on one line');
  expect(prompt).toContain('prefer existing scripts');
  expect(prompt).toContain('Windows PowerShell');
});
