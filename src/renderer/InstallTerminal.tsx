import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function InstallTerminal({ active, output }: { active: boolean; output: string }) {
  const host = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const previous = useRef('');
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    if (!host.current) return;
    const terminal = new XTerm({ cursorBlink: true, convertEol: true, fontFamily: 'SFMono-Regular, Menlo, monospace', fontSize: 12, theme: { background: '#282C34', foreground: '#D8DEE9', cursor: '#88C0D0', selectionBackground: '#4C566A' }, scrollback: 5000 });
    const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(host.current);
    // FitAddon subtracts padding on .xterm, but not padding on its parent.
    // Parent padding made the last row extend beneath the clipped panel edge.
    if (terminal.element) {
      terminal.element.style.padding = '12px 12px 24px';
      terminal.element.style.backgroundColor = '#282C34';
      const viewport = terminal.element.querySelector<HTMLElement>('.xterm-viewport');
      if (viewport) viewport.style.backgroundColor = '#282C34';
    }
    terminalRef.current = terminal;
    fitRef.current = fit;
    const input = terminal.onData(data => { void window.devenv.installInput(data).catch(() => {}); });
    const observer = new ResizeObserver(() => { try { fit.fit(); if (activeRef.current) void window.devenv.installResize(terminal.cols, terminal.rows).catch(() => {}); } catch { /* tab may be hidden */ } });
    observer.observe(host.current);
    fit.fit();
    return () => { observer.disconnect(); input.dispose(); terminal.dispose(); terminalRef.current = null; fitRef.current = null; previous.current = ''; };
  }, []);
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    if (output.startsWith(previous.current)) terminal.write(output.slice(previous.current.length));
    else { terminal.reset(); terminal.write(output); }
    previous.current = output;
  }, [output]);
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
        const terminal = terminalRef.current;
        if (terminal) {
          void window.devenv.installResize(terminal.cols, terminal.rows).catch(() => {});
          terminal.scrollToBottom();
          terminal.focus();
        }
      } catch { /* tab may have become hidden */ }
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return <div ref={host} className="install-terminal h-full min-h-0 w-full overflow-hidden bg-[#282C34]" aria-label="Interactive installation terminal" />;
}
