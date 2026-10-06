export interface TerminalTheme { background: string; foreground: string; accent: string; secondary: string; source: string }

const fallback: TerminalTheme = { background: '#282C34', foreground: '#ABB2BF', accent: '#00FF00', secondary: '#875FFF', source: 'default' };

function ansi256(index: number): string {
  const standard = ['#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#C0C0C0', '#808080', '#FF0000', '#00FF00', '#FFFF00', '#0000FF', '#FF00FF', '#00FFFF', '#FFFFFF'];
  if (index < 16) return standard[index];
  if (index < 232) {
    const value = index - 16;
    const channel = (part: number) => part === 0 ? 0 : 55 + part * 40;
    const hex = (part: number) => channel(part).toString(16).padStart(2, '0');
    return `#${hex(Math.floor(value / 36))}${hex(Math.floor(value / 6) % 6)}${hex(value % 6)}`.toUpperCase();
  }
  const gray = (8 + (index - 232) * 10).toString(16).padStart(2, '0');
  return `#${gray}${gray}${gray}`.toUpperCase();
}

export function themeFromZshrc(zshrc: string): TerminalTheme {
  const prompt = zshrc.match(/^\s*(?:export\s+)?PROMPT\s*=\s*["']([^\n]*?)["']\s*$/m)?.[1];
  const colors = [...(prompt ?? '').matchAll(/%F\{(\d{1,3})\}/g)].map(match => Number(match[1])).filter(value => value >= 0 && value <= 255);
  return colors.length ? { ...fallback, accent: ansi256(colors[0]), secondary: ansi256(colors[1] ?? colors[0]), source: '~/.zshrc PROMPT' } : fallback;
}
