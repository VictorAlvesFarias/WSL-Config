import { useEffect, useState } from 'react';
import { bytes, elapsed } from '../format';
import type { Job } from '../types';
import { Icon } from './Icon';

/** Long operations in progress (exports, imports, moves, downloads) with their progress. */
export function JobsBar({ jobs }: { jobs: Job[] }) {
  const [, tick] = useState(0);
  // One entry per job (a duplicate locks two distros with the same job label).
  const visible = jobs.filter((job, index) => jobs.findIndex((other) => other.label === job.label) === index);

  useEffect(() => {
    if (!visible.length) return;
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [visible.length]);

  if (!visible.length) return null;

  return (
    <div className="jobs">
      {visible.map((job) => {
        const percent = job.total && job.bytes !== null ? Math.min(100, Math.round((job.bytes / job.total) * 100)) : null;
        return (
          <div key={job.id} className="job card">
            <Icon name="refresh" />
            <div className="job-text">
              <strong>{job.label}</strong>
              <span className="muted small">
                {elapsed(job.startedAt)}
                {job.bytes !== null && ` · ${bytes(job.bytes)}${job.total ? ` de ${bytes(job.total)}` : ''}`}
              </span>
              <div className={`progress${percent === null ? ' indeterminate' : ''}`}>
                <div style={percent === null ? undefined : { width: `${percent}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
