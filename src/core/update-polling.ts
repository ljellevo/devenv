export const UPDATE_CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000;
export const UPDATE_CHECK_START_DELAY_MS = 4000;

export function startUpdatePolling(check: () => void, intervalMs = UPDATE_CHECK_INTERVAL_MS, startDelayMs = UPDATE_CHECK_START_DELAY_MS) {
  let stopped = false;
  let lastCheckAt: number | undefined;
  let timer: ReturnType<typeof setTimeout>;

  const run = () => {
    if (stopped) return;
    lastCheckAt = Date.now();
    check();
    timer = setTimeout(run, intervalMs);
  };
  const checkIfDue = () => {
    if (stopped || lastCheckAt === undefined || Date.now() - lastCheckAt < intervalMs) return;
    clearTimeout(timer);
    run();
  };

  timer = setTimeout(run, startDelayMs);
  return { checkIfDue, stop: () => { stopped = true; clearTimeout(timer); } };
}
