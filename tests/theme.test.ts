import { expect, test } from 'vitest';
import { themeFromZshrc } from '../src/core/theme';

test('uses prompt colors from zsh without evaluating shell code', () => {
  const theme = themeFromZshrc('export PROMPT="%F{46}hello%F{99}world"\n');
  expect(theme).toMatchObject({ background: '#282C34', accent: '#00FF00', secondary: '#875FFF', source: '~/.zshrc PROMPT' });
  expect(themeFromZshrc('PROMPT="$(touch /tmp/do-not-run)"').source).toBe('default');
});
