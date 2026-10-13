import type { HarnessExit, HarnessOutput, HarnessSnapshot, HarnessStatus } from '../shared/types';

// A harness that has been silent this long is waiting for the user.
const idleAfter = 2000;
// Output this soon after a keystroke or resize is an echo or a redraw, not the harness working.
const echoWindow = 300;

/** Derives whether each project's harness is working, idle, or exited from the output it writes. */
export class HarnessActivity {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private touched = new Map<string, number>();
  constructor(private statuses: Record<string, HarnessStatus>, private changed: () => void) {}
  opened(id: string, snapshot: HarnessSnapshot) {
    // Attaching to the launch that is already tracked keeps its working or idle state.
    if (snapshot.running && this.statuses[id]?.run === snapshot.run) return;
    this.settle(id);
    this.statuses[id] = { run: snapshot.run, command: snapshot.command, state: snapshot.running ? 'idle' : 'exited' };
    this.changed();
  }
  /** The user typed into or resized the harness. */
  touch(id: string) { this.touched.set(id, Date.now()); }
  event(event: HarnessOutput | HarnessExit) {
    const status = this.statuses[event.id];
    if (!status || status.run !== event.run || status.state === 'exited') return;
    if (!('data' in event)) { this.settle(event.id); status.state = 'exited'; this.changed(); return; }
    if (Date.now() - (this.touched.get(event.id) ?? -echoWindow) < echoWindow) return;
    this.settle(event.id);
    this.timers.set(event.id, setTimeout(() => { this.timers.delete(event.id); if (this.statuses[event.id] === status && status.state === 'working') { status.state = 'idle'; this.changed(); } }, idleAfter));
    if (status.state !== 'working') { status.state = 'working'; this.changed(); }
  }
  private settle(id: string) { clearTimeout(this.timers.get(id)); this.timers.delete(id); }
}
