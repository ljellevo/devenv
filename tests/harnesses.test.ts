import { expect, it } from 'vitest';
import { customHarnesses, harnessCommand, harnessLabel, projectHarness } from '../src/shared/harnesses';
import type { Settings } from '../src/shared/types';

const settings = (value: Partial<Settings>) => value;

it('resolves a project harness before the one from Settings', () => {
  const value = settings({ harness: 'codex', harnessCommand: '', projectHarnesses: { a: { harness: 'custom', harnessCommand: ' aider --model sonnet ' } } });
  expect(harnessCommand(projectHarness(value, 'a'))).toBe('aider --model sonnet');
  expect(harnessLabel(projectHarness(value, 'a'))).toBe('aider');
  expect(harnessCommand(projectHarness(value, 'b'))).toBe('codex');
  expect(harnessLabel(projectHarness(value, 'b'))).toBe('Codex');
  // Settings written before harnesses existed fall back to Claude Code.
  expect(harnessCommand(projectHarness({}, 'a'))).toBe('claude');
});

it('lists a custom command only while Settings or a known project uses it', () => {
  const projectHarnesses = { a: { harness: 'custom' as const, harnessCommand: 'gemini' }, b: { harness: 'custom' as const, harnessCommand: 'aider' }, c: { harness: 'custom' as const, harnessCommand: 'gemini' }, d: { harness: 'codex' as const, harnessCommand: '' }, gone: { harness: 'custom' as const, harnessCommand: 'opencode' } };
  expect(customHarnesses(settings({ harness: 'claude', harnessCommand: 'unused', projectHarnesses }), ['a', 'b', 'c', 'd'])).toEqual(['aider', 'gemini']);
  expect(customHarnesses(settings({ harness: 'custom', harnessCommand: 'amp', projectHarnesses }), ['a'])).toEqual(['amp', 'gemini']);
  expect(customHarnesses(settings({ harness: 'claude', harnessCommand: '', projectHarnesses: { d: projectHarnesses.d } }), ['d'])).toEqual([]);
  expect(customHarnesses({}, ['a'])).toEqual([]);
});
