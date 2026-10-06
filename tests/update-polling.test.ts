import { afterEach, describe, expect, it, vi } from 'vitest';
import { startUpdatePolling, UPDATE_CHECK_INTERVAL_MS } from '../src/core/update-polling';

afterEach(() => vi.useRealTimers());

describe('automatic update checks', () => {
  it('checks after launch and again three hours after the previous check', () => {
    vi.useFakeTimers();
    const check = vi.fn();
    const poller = startUpdatePolling(check);
    vi.advanceTimersByTime(3999);
    expect(check).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(check).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS - 1);
    expect(check).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(check).toHaveBeenCalledTimes(2);
    poller.stop();
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('checks on activity when a sleeping Mac has missed its interval', () => {
    vi.useFakeTimers();
    const check = vi.fn();
    const poller = startUpdatePolling(check);
    vi.advanceTimersByTime(4000);
    vi.setSystemTime(Date.now() + UPDATE_CHECK_INTERVAL_MS + 1000);
    poller.checkIfDue();
    poller.checkIfDue();
    expect(check).toHaveBeenCalledTimes(2);
    poller.stop();
  });
});
