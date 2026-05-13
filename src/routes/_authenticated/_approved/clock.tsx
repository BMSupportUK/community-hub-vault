import { createFileRoute } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { Coming } from "@/components/app/Coming";

export const Route = createFileRoute("/_authenticated/_approved/clock")({
  component: () => <Coming title="Time Clock" Icon={Clock} desc="Clock in, breaks, and timesheets. Coming next." />,
});
