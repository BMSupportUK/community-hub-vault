import { createFileRoute } from "@tanstack/react-router";
import { SportsGuideEditor } from "@/components/app/SportsGuideEditor";

export const Route = createFileRoute("/_authenticated/_approved/sports-guides/new")({
  component: () => <SportsGuideEditor />,
});