import { expect, it } from 'vitest';
import { customHarnesses, harnessCommand, harnessKey, harnessKeys, harnessLabel, harnessProject, harnessTab, newTabShortcut, projectHarness } from '../src/shared/harnesses';
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

it('translates the chords a terminal cannot send on its own', () => {
  const chord = (key: string, held: Partial<Record<'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey', boolean>> = {}) => ({ key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...held });
  // Shift+Enter is a new line on every platform; Enter and Alt+Enter are left to the terminal.
  for (const host of ['macos', 'linux', 'windows'] as const) expect(harnessKeys(chord('Enter', { shiftKey: true }), host)).toBe('\x1b\r');
  expect(harnessKeys(chord('Enter'), 'macos')).toBeUndefined();
  expect(harnessKeys(chord('Enter', { altKey: true }), 'macos')).toBeUndefined();
  expect(harnessKeys(chord('Enter', { shiftKey: true, ctrlKey: true }), 'macos')).toBeUndefined();
  // ⌘ edits the line on macOS only, where no other key sends it.
  expect(['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight'].map(key => harnessKeys(chord(key, { metaKey: true }), 'macos'))).toEqual(['\x15', '\x0b', '\x01', '\x05']);
  expect(harnessKeys(chord('Backspace', { metaKey: true }), 'linux')).toBeUndefined();
  expect(harnessKeys(chord('Backspace'), 'macos')).toBeUndefined();
  expect(harnessKeys(chord('Backspace', { metaKey: true, altKey: true }), 'macos')).toBeUndefined();
  expect(harnessKeys(chord('k', { metaKey: true }), 'macos')).toBeUndefined();
});

it('keys the first tab by the project alone and later tabs by their number', () => {
  expect(harnessKey('a1b2', 1)).toBe('a1b2');
  expect(harnessKey('a1b2', 3)).toBe('a1b2:3');
  expect(harnessProject('a1b2')).toBe('a1b2');
  expect(harnessProject('a1b2:3')).toBe('a1b2');
  expect(harnessTab('a1b2', 'a1b2')).toBe(1);
  expect(harnessTab('a1b2:3', 'a1b2')).toBe(3);
  expect(harnessTab('a1b2c3', 'a1b2')).toBeUndefined();
  expect(harnessTab('a1b2:x', 'a1b2')).toBeUndefined();
});

it('opens a new tab with ⌘T on macOS and Ctrl+Shift+T elsewhere, leaving Ctrl+T to the terminal', () => {
  const key = (value: Partial<{ shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }>) => ({ key: 't', shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...value });
  expect(newTabShortcut(key({ metaKey: true }), 'macos')).toBe(true);
  expect(newTabShortcut(key({ ctrlKey: true }), 'macos')).toBe(false);
  expect(newTabShortcut(key({ ctrlKey: true }), 'linux')).toBe(false);
  expect(newTabShortcut({ ...key({ ctrlKey: true, shiftKey: true }), key: 'T' }, 'windows')).toBe(true);
  expect(newTabShortcut(key({ metaKey: true, shiftKey: true }), 'macos')).toBe(false);
});
