import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { bytes, elapsed } from '../format';
import type { Job } from '../types';

/** One entry per job (a duplicate locks two distros with the same job label). */
export const distinctJobs = (jobs: Job[]) => jobs.filter((job, index) => jobs.findIndex((other) => other.label === job.label) === index);

export const jobPercent = (job: Job) => (job.total && job.bytes !== null ? Math.min(100, Math.round((job.bytes / job.total) * 100)) : null);

/** Long operations in progress (exports, imports, moves, downloads) with their progress. */
export function JobsBar({ jobs }: { jobs: Job[] }) {
  const [, tick] = useState(0);
  const visible = distinctJobs(jobs);

  useEffect(() => {
    if (!visible.length) return;
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [visible.length]);

  if (!visible.length) return null;

  return (
    <div className="grid shrink-0 gap-2 border-b border-line bg-sidebar/60 px-5 py-2.5 md:grid-cols-2 xl:grid-cols-3">
      {visible.map((job) => {
        const percent = jobPercent(job);
        return (
          <div key={job.id} className="flex items-center gap-3 rounded-md border border-line bg-panel px-3 py-2">
            <LoaderCircle className="size-4 shrink-0 animate-spin text-accent" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-baseline gap-2">
                <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{job.label}</p>
                {percent !== null && <span className="text-[12px] font-semibold text-accent">{percent}%</span>}
              </div>
              <p className="truncate text-[11.5px] text-fg-muted">
                {elapsed(job.startedAt)}
                {job.bytes !== null && ` · ${bytes(job.bytes)}${job.total ? ` de ${bytes(job.total)}` : ''}`}
              </p>
              <div className="h-1 overflow-hidden rounded-full bg-panel-2">
                <div
                  className={percent === null ? 'h-full w-1/3 animate-pulse rounded-full bg-accent' : 'h-full rounded-full bg-accent transition-[width]'}
                  style={percent === null ? undefined : { width: `${percent}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
