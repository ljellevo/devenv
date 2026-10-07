import { Ghost, SquareTerminal, Terminal } from 'lucide-react';
import { terminalApps } from '../shared/terminals';
import type { TerminalApp } from '../shared/types';

const icons: Record<TerminalApp, typeof Terminal> = { terminal: SquareTerminal, iterm: Terminal, ghostty: Ghost };
export const terminalOptions = terminalApps.map(app => ({ ...app, icon: icons[app.value] }));
