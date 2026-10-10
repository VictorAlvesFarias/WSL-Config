import { notify, say, state, updateState, type Job } from './events.ts';
import { refreshStatus } from './status.ts';
import { newId } from './store.ts';
import { HttpError } from './validation.ts';
import { fileSize } from './wsl.ts';

export interface JobContext {
  job: Job;
  /** Reports progress; the UI is updated at most once per second. */
  progress: (bytes: number | null, total?: number | null) => void;
  /** Follows a file that grows while the job runs (export target, new vhdx, download). */
  watchFile: (path: string, total?: number | null) => () => void;
  /** Logs a line of wsl.exe output. */
  log: (line: string) => void;
}

let lastPush = 0;

function pushJobs(force = false): void {
  if (!force && Date.now() - lastPush < 1000) return;
  lastPush = Date.now();
  updateState({ jobs: [...state.jobs] });
}

const busyWith = (distro: string) => state.jobs.find((job) => job.distro?.toLowerCase() === distro.toLowerCase());

/**
 * Runs one long operation. Each distro takes one job at a time (exporting while moving it would
 * race), and "global" jobs (shutdown) wait for nothing else to be running. The busy checks throw
 * synchronously, so a route can refuse the request before answering 202.
 */
export function runJob<T>(distros: string[], label: string, action: (context: JobContext) => Promise<T>, { global = false } = {}): Promise<T> {
  if (global && state.jobs.length > 0) throw new HttpError(409, `Aguarde: ${state.jobs[0].label}`);
  if (!global && state.jobs.some((job) => job.global)) throw new HttpError(409, `Aguarde: ${state.jobs[0].label}`);
  for (const distro of distros) {
    const running = busyWith(distro);
    if (running) throw new HttpError(409, `Aguarde: ${running.label}`);
  }
  return execute(distros, label, action, global);
}

/** Starts a job without waiting for it: the result reaches the UI as a toast (and the log). */
export function startJob(distros: string[], label: string, action: (context: JobContext) => Promise<string>, options: { global?: boolean } = {}): void {
  runJob(distros, label, action, options).then(
    (message) => notify('ok', message),
    (error: Error) => notify('error', error.message),
  );
}

async function execute<T>(distros: string[], label: string, action: (context: JobContext) => Promise<T>, global: boolean): Promise<T> {

  const jobs: Job[] = (distros.length ? distros : [null]).map((distro) => ({
    id: newId(),
    distro,
    label,
    global,
    startedAt: new Date().toISOString(),
    bytes: null,
    total: null,
  }));
  const job = jobs[0];
  state.jobs.push(...jobs);
  pushJobs(true);
  say(`==> ${label}`);

  const watchers = new Set<NodeJS.Timeout>();
  const context: JobContext = {
    job,
    progress: (bytes, total) => {
      for (const item of jobs) {
        item.bytes = bytes;
        if (total !== undefined) item.total = total;
      }
      pushJobs();
    },
    watchFile: (path, total = null) => {
      const timer = setInterval(async () => context.progress(await fileSize(path), total), 1000);
      watchers.add(timer);
      return () => {
        clearInterval(timer);
        watchers.delete(timer);
      };
    },
    log: (line) => say(`    ${line.trim()}`),
  };

  try {
    const result = await action(context);
    say(`[OK] ${label}`, 'ok');
    return result;
  } catch (error) {
    say(`[X] ${label}: ${(error as Error).message}`, 'error');
    throw error;
  } finally {
    for (const timer of watchers) clearInterval(timer);
    // Refresh before releasing the job, so the toast and the new distro list arrive together.
    await refreshStatus(true);
    state.jobs = state.jobs.filter((item) => !jobs.includes(item));
    pushJobs(true);
  }
}
