import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { Appearance } from '../shared/types';

export const appearanceOptions: { value: Appearance; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
];

const darkQuery = '(prefers-color-scheme: dark)';

/** Resolves the System appearance to light or dark, following macOS as it changes. */
export function useResolvedAppearance(appearance: Appearance): 'light' | 'dark' {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(darkQuery).matches);
  useEffect(() => {
    const media = window.matchMedia(darkQuery);
    const sync = () => setSystemDark(media.matches);
    sync(); media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [appearance]);
  return appearance === 'system' ? (systemDark ? 'dark' : 'light') : appearance;
}
