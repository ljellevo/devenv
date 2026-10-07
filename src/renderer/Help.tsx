import ReactMarkdown from 'react-markdown';
import { isValidElement, type ReactNode } from 'react';
import remarkGfm from 'remark-gfm';
import { CircleHelp } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import guide from '../../docs/user-guide.md?raw';

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
const headingText = (value: ReactNode): string => Array.isArray(value) ? value.map(headingText).join('') : isValidElement<{ children?: ReactNode }>(value) ? headingText(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const sections = [...guide.matchAll(/^## (.+)$/gm)].map(match => ({ title: match[1], id: slug(match[1]) }));

export function Help({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex h-[min(84vh,780px)] w-[calc(100vw-96px)] max-w-[920px] flex-col gap-0 overflow-hidden p-0">
    <div className="shrink-0 border-b px-6 py-4 pr-12"><DialogTitle className="flex items-center gap-2"><CircleHelp className="size-5 text-primary" />Help</DialogTitle><DialogDescription className="mt-1">Everything you need to use Devenv.</DialogDescription></div>
    <div className="flex min-h-0 flex-1">
      <nav aria-label="Help topics" className="hidden w-52 shrink-0 space-y-1 overflow-y-auto border-r px-3 py-4 sm:block">{sections.map(section => <a key={section.id} href={`#${section.id}`} onClick={event => { event.preventDefault(); document.getElementById(section.id)?.scrollIntoView({ block: 'start' }); }} className="block rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-foreground">{section.title}</a>)}</nav>
      <article aria-label="Devenv user guide" className="min-w-0 flex-1 overflow-y-auto px-7 py-5 text-sm leading-6">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
          h1: ({ children }) => <h1 className="mb-5 text-2xl font-semibold tracking-tight">{children}</h1>,
          h2: ({ children }) => <h2 id={slug(headingText(children))} className="mb-3 mt-8 scroll-mt-4 border-t pt-6 text-lg font-semibold first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-5 font-semibold">{children}</h3>,
          p: ({ children }) => <p className="mb-3 text-foreground/85">{children}</p>,
          ul: ({ children }) => <ul className="mb-4 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-4 list-decimal space-y-1 pl-5">{children}</ol>,
          pre: ({ children }) => <pre className="mb-4 overflow-x-auto rounded-lg bg-[var(--surface)] p-4 text-xs">{children}</pre>,
          code: ({ children, className }) => <code className={className ?? 'rounded bg-[var(--surface)] px-1 py-0.5 text-xs'}>{children}</code>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          a: ({ children, href }) => <a href={href} onClick={event => { if (href?.startsWith('#')) { event.preventDefault(); document.getElementById(href.slice(1))?.scrollIntoView({ block: 'start' }); } }} className="text-primary underline underline-offset-2">{children}</a>,
        }}>{guide}</ReactMarkdown>
      </article>
    </div>
  </DialogContent></Dialog>;
}
