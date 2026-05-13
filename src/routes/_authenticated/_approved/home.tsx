import { createFileRoute } from "@tanstack/react-router";
import { ChannelColumn } from "@/components/app/ChannelColumn";
import { Megaphone, Hash } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/_approved/home")({
  component: HomePage,
});

function HomePage() {
  const { isStaff } = useAuth();
  return (
    <>
      <ChannelColumn
        title="Hub"
        groups={[
          {
            label: "Information",
            items: [
              { to: "/home", label: "welcome", icon: Megaphone },
              { to: "/home", label: "rules", icon: Hash },
            ],
          },
          {
            label: "Community",
            items: [
              { to: "/home", label: "general", icon: Hash },
              { to: "/home", label: "off-topic", icon: Hash },
            ],
          },
          ...(isStaff ? [{ label: "Staff", items: [{ to: "/home", label: "staff-room", icon: Hash }] }] : []),
        ]}
      />
      <main className="flex-1 flex flex-col">
        <header className="h-14 border-b border-border px-5 flex items-center gap-2">
          <Megaphone className="size-4 text-muted-foreground" />
          <h1 className="font-display font-semibold">welcome</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="rounded-2xl bg-surface border border-border p-8">
              <h2 className="font-display text-3xl font-bold">You're in.</h2>
              <p className="text-muted-foreground mt-2">Pick a section from the icon rail on the left to get started.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Tile title="Open a ticket" desc="Get help from staff." href="/tickets" />
              <Tile title="Browse the shop" desc="Pick up server perks." href="/shop" />
              <Tile title="Install guides" desc="Step-by-step setup with read tracking." href="/install-guides" />
              <Tile title="Sports guides" desc="Reference PDFs by sport." href="/sports-guides" />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function Tile({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <a href={href} className="rounded-xl bg-surface border border-border p-5 hover:bg-surface-2 transition-colors block">
      <div className="font-display font-semibold">{title}</div>
      <div className="text-sm text-muted-foreground mt-1">{desc}</div>
    </a>
  );
}
