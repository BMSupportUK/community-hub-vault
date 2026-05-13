import { createFileRoute } from "@tanstack/react-router";
import { ShoppingBag, BookOpen, FileText, Clock, Calendar } from "lucide-react";
import { Coming } from "@/components/app/Coming";

const meta: Record<string, { title: string; icon: any; desc: string }> = {
  "shop": { title: "Shop", icon: ShoppingBag, desc: "Server storefront. Coming next." },
  "install-guides": { title: "Install Guides", icon: BookOpen, desc: "Block-based guides with mark-as-read tracking. Coming next." },
  "sports-guides": { title: "Sports Guides", icon: FileText, desc: "PDF library by sport. Coming next." },
  "clock": { title: "Time Clock", icon: Clock, desc: "Clock in, breaks, and timesheets. Coming next." },
  "shifts": { title: "Shifts", icon: Calendar, desc: "Browse and apply for shifts. Coming next." },
};

const m = meta["shifts"];

export const Route = createFileRoute("/_authenticated/_approved/shifts")({
  component: () => <Coming title={m.title} Icon={m.icon} desc={m.desc} />,
});
