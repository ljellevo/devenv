import { useCallback, useEffect, useRef, useState } from 'react';
import { configureMonacoTheme, loadMonaco, type MonacoEditor } from './monaco';
import { Check, CircleAlert, RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { ConfigDocument, ConfigValidation, Project } from '../shared/types';

export function ConfigEditor({ project, open, onClose, active, appearance }: { project: Project; open: boolean; onClose(): void; active: boolean; appearance: 'light' | 'dark' }) {
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<MonacoEditor | null>(null);
  const saveRef = useRef<() => void>(() => {});
  const [document, setDocument] = useState<ConfigDocument>();
  const [text, setText] = useState('');
  const [validation, setValidation] = useState<ConfigValidation>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discardAction, setDiscardAction] = useState<'close' | 'reload' | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = !!document && text !== document.text;

  const load = useCallback(async () => {
    setLoading(true); setError(''); setValidation(undefined);
    try {
      const next = await window.devenv.readConfig(project.id);
      setDocument(next); setText(next.text); editor.current?.setValue(next.text);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }, [project.id]);

  useEffect(() => { if (open) void load(); }, [open, load]);
  useEffect(() => {
    if (!document || loading) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void window.devenv.validateConfig(project.id, text).then(result => {
        if (cancelled) return;
        setValidation(result);
        const model = editor.current?.getModel();
        if (model) void loadMonaco().then(monaco => monaco.editor.setModelMarkers(model, 'devenv', result.valid || !result.line ? [] : [{ severity: monaco.MarkerSeverity.Error, message: result.message ?? 'Invalid TOML', startLineNumber: result.line, endLineNumber: result.line, startColumn: result.column ?? 1, endColumn: (result.column ?? 1) + 1 }]));
      }).catch(cause => { if (!cancelled) setValidation({ valid: false, message: cause instanceof Error ? cause.message : String(cause) }); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [document, loading, project.id, text]);

  const save = async () => {
    if (!document || !dirty || saving) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      const next = await window.devenv.saveConfig(project.id, text, document.revision);
      setDocument(next); setText(next.text); setValidation({ valid: true }); setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  };
  saveRef.current = () => { void save(); };

  useEffect(() => {
    if (!open || !document || !container.current || editor.current) return;
    let cancelled = false;
    let dispose = () => {};
    void loadMonaco().then(monaco => {
      if (cancelled || !container.current) return;
      const monacoTheme = configureMonacoTheme(monaco, appearance);
      const instance = monaco.editor.create(container.current, {
        value: document.text, language: 'toml', theme: monacoTheme,
        automaticLayout: true, minimap: { enabled: false }, fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        lineNumbersMinChars: 3, scrollBeyondLastLine: false, tabSize: 2, wordWrap: 'on',
        padding: { top: 16, bottom: 16 }, renderWhitespace: 'selection',
      });
      editor.current = instance;
      const change = instance.onDidChangeModelContent(() => { setText(instance.getValue()); setValidation(undefined); setSaved(false); });
      instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
      dispose = () => { change.dispose(); instance.dispose(); editor.current = null; };
    }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { cancelled = true; dispose(); };
  }, [open, !!document, appearance]);

  const close = () => { if (dirty) setDiscardAction('close'); else onClose(); };
  return <>
    <Dialog open={open} onOpenChange={value => { if (!value) close(); }}>
      <DialogContent className="grid h-[calc(100vh-120px)] max-h-[700px] w-[calc(100vw-120px)] max-w-[1000px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-6 py-4 pr-12">
          <div className="min-w-0"><DialogTitle className="flex items-center gap-2">{project.name} configuration {dirty && <span className="size-2 rounded-full bg-amber-500" aria-label="Unsaved changes" />}</DialogTitle><DialogDescription className="mono mt-1 truncate text-xs">{project.path}</DialogDescription></div>
          <div className="flex shrink-0 items-center gap-2 pl-4"><Button variant="outline" size="sm" disabled={loading || saving} onClick={() => { if (dirty) setDiscardAction('reload'); else void load(); }}><RefreshCw />Reload</Button><Button size="sm" disabled={!dirty || saving || loading || validation?.valid === false} onClick={() => void save()}>{saved ? <Check /> : <Save />}{saving ? 'Saving…' : saved ? 'Saved' : 'Save'}</Button></div>
        </div>
        <div className={appearance === 'light' ? 'relative min-h-0 bg-[#ECEFF4]' : 'relative min-h-0 bg-[#2E3440]'}>
          {loading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-background text-sm text-muted-foreground">Loading configuration…</div>}
          <div ref={container} className="h-full w-full" aria-label="TOML configuration editor" />
          {!loading && !document && <div className="absolute inset-0 flex items-center justify-center bg-background"><Button onClick={() => void load()}>Retry loading</Button></div>}
        </div>
        <div className="flex min-h-12 items-center justify-between gap-4 border-t bg-[var(--surface)] px-6 py-2 text-xs">
          <div className="min-w-0">{error ? <span role="alert" className="flex items-center gap-2 text-destructive"><CircleAlert className="size-3.5 shrink-0" />{error}</span> : validation?.valid === false ? <span role="status" className="flex items-center gap-2 text-destructive"><CircleAlert className="size-3.5 shrink-0" /><span className="truncate" title={validation.message}>{validation.message}</span></span> : validation?.valid ? <span className="flex items-center gap-2 text-primary"><Check className="size-3.5" />Valid configuration</span> : <span className="text-muted-foreground">TOML · ⌘S to save</span>}</div>
          {active && <span className="shrink-0 text-muted-foreground">Changes apply when this session is next started.</span>}
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={!!discardAction} onOpenChange={value => { if (!value) setDiscardAction(null); }}>
      <DialogContent><DialogTitle>Discard unsaved edits?</DialogTitle><DialogDescription>The configuration file on disk will stay as it is.</DialogDescription><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDiscardAction(null)}>Keep editing</Button><Button variant="destructive" onClick={() => { const action = discardAction; setDiscardAction(null); if (action === 'close') onClose(); else if (action === 'reload') void load(); }}>Discard edits</Button></div></DialogContent>
    </Dialog>
  </>;
}
