export type Platform = 'macos' | 'linux' | 'windows';
export type ExecutionTarget = { kind: 'native' } | { kind: 'wsl'; distribution: string };
export interface SearchRoot { path: string; target: ExecutionTarget }
export const nativeTarget: ExecutionTarget = { kind: 'native' };
export function hostPlatform(value: string): Platform {
  if (value === 'darwin') return 'macos';
  if (value === 'win32') return 'windows';
  if (value === 'linux') return 'linux';
  throw new Error(`Unsupported platform: ${value}`);
}
export const executionPlatform = (host: Platform, target: ExecutionTarget): Platform => target.kind === 'wsl' ? 'linux' : host;
export const targetIdentity = (host: Platform, target: ExecutionTarget): string => target.kind === 'wsl' ? `wsl:${target.distribution}` : `native:${host}`;
export const fileManager = (host: Platform) => host === 'macos' ? 'Finder' : host === 'windows' ? 'Explorer' : 'File Manager';
export const shortcutModifier = (host: Platform) => host === 'macos' ? '⌘' : 'Ctrl';
export const platformName = (host: Platform) => host === 'macos' ? 'macOS' : host === 'windows' ? 'Windows' : 'Linux';
