import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FanZoneMutedScreen } from "@/components/app/FanZoneMutedScreen";

export const Route = createFileRoute("/fanzone-mute-demo")({
  head: () => ({
    meta: [
      { title: "Mute screen preview | Boro Fan Zone" },
      { name: "description", content: "Preview of the Boro Fan Zone mute screen: naughty-step illustration, mute reason and a live countdown until posting is restored." },
      { property: "og:title", content: "Mute screen preview | Boro Fan Zone" },
      { property: "og:description", content: "Preview of the Boro Fan Zone mute screen with reason and live countdown." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MuteDemoPage,
});

function MuteDemoPage() {
  const [mode, setMode] = useState<"active" | "expired">("active");
  const expiresAt =
    mode === "active"
      ? new Date(Date.now() + 2 * 3600_000 + 34 * 60_000 + 12_000).toISOString()
      : new Date(Date.now() - 60_000).toISOString();

  return (
    <main className="min-h-screen w-full overflow-y-auto bg-[#0B1A2B]">
      <div className="mx-auto flex w-full max-w-xl items-center justify-center gap-2 px-4 pt-6">
        <Button
          size="sm"
          variant={mode === "active" ? "default" : "outline"}
          onClick={() => setMode("active")}
        >
          Mute active
        </Button>
        <Button
          size="sm"
          variant={mode === "expired" ? "default" : "outline"}
          onClick={() => setMode("expired")}
        >
          Mute expired
        </Button>
      </div>
      <FanZoneMutedScreen
        key={mode}
        expiresAt={expiresAt}
        reason="Repeated personal abuse towards another member in the Match Day thread. Keep the banter about the football, not the fans."
        mutedBy="Dane J (Moderator)"
      />
    </main>
  );
}
