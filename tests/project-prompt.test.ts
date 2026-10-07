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
