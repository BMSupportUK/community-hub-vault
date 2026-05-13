import { createFileRoute } from "@tanstack/react-router";
import { Calendar } from "lucide-react";
import { Coming } from "@/components/app/Coming";

export const Route = createFileRoute("/_authenticated/_approved/shifts")({
  component: () => <Coming title="Shifts" Icon={Calendar} desc="Browse and apply for shifts. Coming next." />,
});
