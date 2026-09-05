import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FanZoneBannedScreen } from "@/components/app/FanZoneBannedScreen";

export const Route = createFileRoute("/fanzone-ban-demo")({
  head: () => ({
    meta: [
      { title: "Ban screen preview | Boro Fan Zone" },
      {
        name: "description",
        content:
          "Preview of the Boro Fan Zone ban screen: courtroom sentencing illustration, ban reason and a live countdown until access returns.",
      },
      { property: "og:title", content: "Ban screen preview | Boro Fan Zone" },
      {
        property: "og:description",
        content: "Preview of the Boro Fan Zone ban screen with reason and live countdown.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BanDemoPage,
});

type Mode = "active" | "permanent" | "expired";

function BanDemoPage() {
  const [mode, setMode] = useState<Mode>("active");
  const expiresAt =
    mode === "permanent"
      ? null
      : mode === "active"
        ? new Date(Date.now() + 6 * 86400_000 + 4 * 3600_000 + 11 * 60_000).toISOString()
        : new Date(Date.now() - 60_000).toISOString();

  return (
    <main className="min-h-screen w-full overflow-y-auto bg-[#0B1A2B]">
      <div className="mx-auto flex w-full max-w-xl flex-wrap items-center justify-center gap-2 px-4 pt-6">
        {(
          [
            ["active", "Ban active"],
            ["permanent", "Permanent ban"],
            ["expired", "Ban served"],
          ] as Array<[Mode, string]>
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={mode === value ? "default" : "outline"}
            onClick={() => setMode(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <FanZoneBannedScreen
        key={mode}
        expiresAt={expiresAt}
        reason="Racist abuse aimed at an away supporter in the Match Day thread, after a previous mute for the same behaviour."
        bannedBy="Dane J (Moderator)"
      />
    </main>
  );
}
