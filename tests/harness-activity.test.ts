import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HarnessActivity } from '../src/main/harness-activity';
import type { HarnessStatus } from '../src/shared/types';

const snapshot = (run: number, running = true) => ({ run, command: 'claude', output: '', offset: 0, running });
const output = (run: number) => ({ id: 'p', run, data: '.', offset: 0 });
let statuses: Record<string, HarnessStatus>, changes: number, activity: HarnessActivity;
beforeEach(() => { vi.useFakeTimers(); statuses = {}; changes = 0; activity = new HarnessActivity(statuses, () => { changes++; }); });
afterEach(() => { vi.useRealTimers(); });

it('is working while output keeps arriving and idle once it has been quiet', () => {
  activity.opened('p', snapshot(1));
  expect(statuses.p).toEqual({ run: 1, command: 'claude', state: 'idle' });
  activity.event(output(1));
  expect(statuses.p.state).toBe('working');
  for (let i = 0; i < 5; i++) { vi.advanceTimersByTime(1500); activity.event(output(1)); }
  expect(statuses.p.state).toBe('working');
  vi.advanceTimersByTime(1999);
  expect(statuses.p.state).toBe('working');
  vi.advanceTimersByTime(1);
  expect(statuses.p.state).toBe('idle');
  // One notification per change, not per chunk of output.
  expect(changes).toBe(3);
});

it('does not count echoed keystrokes or resize redraws as work', () => {
  activity.opened('p', snapshot(1));
  activity.touch('p'); activity.event(output(1));
  vi.advanceTimersByTime(299); activity.event(output(1));
  expect(statuses.p.state).toBe('idle');
  vi.advanceTimersByTime(1); activity.event(output(1));
  expect(statuses.p.state).toBe('working');
});

it('reports the exit and ignores events from an earlier launch', () => {
  activity.opened('p', snapshot(1));
  activity.event(output(1));
  activity.event({ id: 'p', run: 1, exitCode: 0 });
  expect(statuses.p.state).toBe('exited');
  vi.advanceTimersByTime(5000); activity.event(output(1));
  expect(statuses.p.state).toBe('exited');
  activity.opened('p', snapshot(2));
  activity.event(output(1)); activity.event({ id: 'p', run: 1, exitCode: 0 });
  expect(statuses.p).toEqual({ run: 2, command: 'claude', state: 'idle' });
  activity.event(output(2));
  // Attaching again to the same launch keeps its state; a finished one shows as exited.
  activity.opened('p', snapshot(2));
  expect(statuses.p.state).toBe('working');
  activity.opened('p', snapshot(2, false));
  expect(statuses.p.state).toBe('exited');
  activity.event(output(9));
  expect(statuses.other).toBeUndefined();
});
