import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { projectSetupPrompt, type ProjectPromptContext } from '../shared/project-prompt';

export function ProjectSetup({ path, onClose, context }: { path: string | null; context?: ProjectPromptContext; onClose(): void }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  useEffect(() => { setCopied(false); setCopyError(''); }, [path]);
  const prompt = path ? projectSetupPrompt(path, context) : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setCopyError(''); }
    catch { setCopyError('Could not copy automatically. Select and copy the text below.'); }
  };
  return <Dialog open={!!path} onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="flex h-[min(78vh,680px)] max-w-[760px] flex-col gap-4 overflow-hidden p-6">
    <div className="shrink-0 pr-8"><DialogTitle>Finish your project configuration</DialogTitle><DialogDescription className="mt-2">An empty devenv.toml was created at <span className="mono break-all text-foreground">{path}</span>. Copy this prompt into an agent, or close the dialog and write the config yourself in the Config tab. External edits appear automatically while Config is open.</DialogDescription></div>
    <textarea aria-label="Agent setup prompt" readOnly value={prompt} onFocus={event => event.currentTarget.select()} className="mono min-h-0 w-full flex-1 resize-none rounded-lg border bg-[var(--surface)] p-4 text-xs leading-5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    {copyError && <p role="alert" className="text-xs text-destructive">{copyError}</p>}
    <div className="flex shrink-0 justify-end gap-2"><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={() => void copy()}>{copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Copy prompt'}</Button></div>
  </DialogContent></Dialog>;
}
