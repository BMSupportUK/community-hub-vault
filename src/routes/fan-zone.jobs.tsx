import { createFileRoute } from "@tanstack/react-router";
import { JobsBoard, jobsQueryOptions } from "@/components/app/JobsBoard";
import { jobsHead } from "@/lib/jobs";
export const Route = createFileRoute("/fan-zone/jobs")({
  head: () => jobsHead("fanzone"),
  loader: ({ context }) => context.queryClient.ensureQueryData(jobsQueryOptions("fanzone")),
  component: () => <JobsBoard zone="fanzone" />,
});