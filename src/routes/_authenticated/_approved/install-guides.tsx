import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { Coming } from "@/components/app/Coming";

export const Route = createFileRoute("/_authenticated/_approved/install-guides")({
  component: () => <Coming title="Install Guides" Icon={BookOpen} desc="Block-based guides with mark-as-read tracking. Coming next." />,
});
