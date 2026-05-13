import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { Coming } from "@/components/app/Coming";

export const Route = createFileRoute("/_authenticated/_approved/sports-guides")({
  component: () => <Coming title="Sports Guides" Icon={FileText} desc="PDF library by sport. Coming next." />,
});
