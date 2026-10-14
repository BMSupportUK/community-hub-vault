import { createFileRoute } from '@tanstack/react-router';
import { JobsAdmin } from '@/components/app/JobsAdmin';
import { jobsHead } from '@/lib/jobs';
export const Route = createFileRoute('/_authenticated/_approved/fan-zone-jobs-admin')({ head: () => jobsHead('fanzone', true), component: () => <JobsAdmin zone="fanzone" /> });
