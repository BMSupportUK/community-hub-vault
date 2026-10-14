import { createFileRoute } from '@tanstack/react-router';
import { JobsAdmin } from '@/components/app/JobsAdmin';
import { jobsHead } from '@/lib/jobs';
export const Route = createFileRoute('/_authenticated/_approved/admin-jobs')({ head: () => jobsHead('bm', true), component: () => <JobsAdmin zone="bm" /> });
