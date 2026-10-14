import { createFileRoute } from "@tanstack/react-router";
import { JobsBoard, jobsQueryOptions } from "@/components/app/JobsBoard";
import { jobsHead } from "@/lib/jobs";
export const Route = createFileRoute("/jobs")({
  head: () => jobsHead("bm"),
  loader: ({ context }) => context.queryClient.ensureQueryData(jobsQueryOptions("bm")),
  component: () => <JobsBoard zone="bm" />,
});