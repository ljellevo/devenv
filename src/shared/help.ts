import shared from '../../docs/help/shared.md?raw';
import macos from '../../docs/help/macos.md?raw';
import linux from '../../docs/help/linux.md?raw';
import windows from '../../docs/help/windows.md?raw';
import posix from '../../docs/help/posix.md?raw';
import powershell from '../../docs/help/powershell.md?raw';
import wslSetup from '../../docs/help/wsl-setup.md?raw';
import wsl from '../../docs/help/wsl.md?raw';
import { executionPlatform, type Platform, type ExecutionTarget } from './platform';
export interface HelpContext { host: Platform; target: ExecutionTarget }
interface Topic { id: string; markdown: string; visible(context: HelpContext): boolean }
export const helpManifest: readonly Topic[] = [
  { id: 'shared', markdown: shared, visible: () => true },
  { id: 'macos', markdown: macos, visible: c => c.host === 'macos' },
  { id: 'linux', markdown: linux, visible: c => c.host === 'linux' },
  { id: 'windows', markdown: windows, visible: c => c.host === 'windows' },
  { id: 'posix', markdown: posix, visible: c => executionPlatform(c.host, c.target) !== 'windows' },
  { id: 'powershell', markdown: powershell, visible: c => executionPlatform(c.host, c.target) === 'windows' },
  { id: 'wsl-setup', markdown: wslSetup, visible: c => c.host === 'windows' },
  { id: 'wsl', markdown: wsl, visible: c => c.target.kind === 'wsl' },
];
export const headingSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
export function composeHelp(context: HelpContext) {
  const topics = helpManifest.filter(topic => topic.visible(context));
  const markdown = topics.map(topic => topic.markdown).join('\n\n');
  const counts = new Map<string, number>();
  // Ignore fenced examples when building navigation and anchors.
  let fenced = false;
  const headings = markdown.split('\n').flatMap((line, lineIndex) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return []; }
    const match = !fenced && line.match(/^(#{1,6}) (.+)$/);
    if (!match) return [];
    const base = headingSlug(match[2].replace(/[`*_]/g, ''));
    const count = counts.get(base) ?? 0; counts.set(base, count + 1);
    return [{ title: match[2], level: match[1].length, line: lineIndex + 1, id: `help-${base}${count ? `-${count}` : ''}` }];
  });
  const ids = new Set(headings.map(h => h.id));
  for (const match of markdown.matchAll(/\]\(#([^\s)]+)\)/g)) {
    if (!ids.has(match[1])) throw new Error(`Invalid filtered Help link: #${match[1]}`);
  }
  return { markdown, headings, sections: headings.filter(h => h.level === 2), topics: topics.map(t => t.id) };
}
