import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/player-approve/$token")({
  head: () => ({
    meta: [
      { title: "Approve BM Player login | BM Support" },
      { name: "description", content: "Approve or deny a BM Player app asking to open on your account." },
      { property: "og:title", content: "Approve BM Player login | BM Support" },
      { property: "og:description", content: "Approve or deny a BM Player app asking to open on your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApprovePage,
});

function ApprovePage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<"loading" | "ready" | "approved" | "denied" | "error">("loading");
  const [device, setDevice] = useState("BM Player");
  const [msg, setMsg] = useState("");
  const call = (body: Record<string, unknown>) =>
    fetch("/api/public/player-approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, ...body }) })
      .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }));
  useEffect(() => {
    void call({ check: true }).then(({ ok, j }) => {
      if (ok) { setDevice(j.device); setState("ready"); } else { setMsg(j.error ?? "This link isn't valid."); setState("error"); }
    });
  }, [token]);
  const decide = async (approve: boolean) => {
    setState("loading");
    const { ok, j } = await call({ approve });
    if (ok) setState(approve ? "approved" : "denied"); else { setMsg(j.error ?? "Something went wrong."); setState("error"); }
  };
  return (
    <main className="min-h-dvh flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold">Approve BM Player login</h1>
        {state === "loading" && <p className="text-muted-foreground">Checking…</p>}
        {state === "ready" && (<>
          <p className="text-muted-foreground">A BM Player app ({device}) is asking to open on your account. Only approve if this is your box.</p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => decide(false)}>Deny</Button>
            <Button onClick={() => decide(true)}>Approve</Button>
          </div>
        </>)}
        {state === "approved" && <p>Approved. BM Player will open in a few seconds.</p>}
        {state === "denied" && <p>Denied. The app stays locked.</p>}
        {state === "error" && <p className="text-destructive">{msg}</p>}
      </div>
    </main>
  );
}
