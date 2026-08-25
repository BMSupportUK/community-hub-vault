import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, RefreshCw, Trash2, ClipboardList } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getBoroTeamSheetStatus,
  recheckBoroTeamSheet,
  postBoroTeamSheetManually,
  deleteBoroTeamSheet,
} from "@/lib/boro-team-sheet.functions";

export const Route = createFileRoute("/_authenticated/_approved/admin-boro-team-sheet")({
  head: () => ({
    meta: [
      { title: "Boro Team Sheets — Owner" },
      { name: "description", content: "Monitor and manage the automatic Middlesbrough team sheet posts in match day threads." },
      { property: "og:title", content: "Boro Team Sheets — Owner" },
      { property: "og:description", content: "Monitor and manage the automatic Middlesbrough team sheet posts in match day threads." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminBoroTeamSheetPage,
});

function AdminBoroTeamSheetPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const load = useServerFn(getBoroTeamSheetStatus);
  const recheck = useServerFn(recheckBoroTeamSheet);
  const postManual = useServerFn(postBoroTeamSheetManually);
  const remove = useServerFn(deleteBoroTeamSheet);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["boro-team-sheets"],
    queryFn: () => load(),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  if (!isAdmin) return <Navigate to="/home" />;

  const refresh = () => qc.invalidateQueries({ queryKey: ["boro-team-sheets"] });

  const runRecheck = async () => {
    setBusy(true);
    try {
      const res = await recheck();
      toast[res.posted > 0 ? "success" : "info"](
        res.posted > 0
          ? `Posted ${res.posted} team sheet${res.posted === 1 ? "" : "s"}`
          : (res.skipped?.[0] ?? res.error ?? "Nothing new to post"),
      );
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Check failed");
    } finally {
      setBusy(false);
    }
  };

  const runManual = async () => {
    setBusy(true);
    try {
      const res = await postManual({ data: { imageUrl, sourceUrl } });
      if (!res.ok) throw new Error(res.error ?? "Could not post");
      toast.success("Team sheet posted to the match day thread");
      setImageUrl("");
      setSourceUrl("");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not post");
    } finally {
      setBusy(false);
    }
  };

  const runRemove = async (id: string) => {
    setBusy(true);
    try {
      const res = await remove({ data: { id } });
      if (!res.ok) throw new Error(res.error ?? "Could not remove");
      toast.success("Removed from the thread");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not remove");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin">
            <ArrowLeft className="size-4 mr-1" /> Owner panel
          </Link>
        </Button>
      </div>

      <header className="space-y-1">
        <h1 className="font-display text-2xl flex items-center gap-2">
          <ClipboardList className="size-6 text-primary" /> Boro team sheets
        </h1>
        <p className="text-sm text-muted-foreground">
          When Middlesbrough's official account posts the first-team line-up, the graphic is added automatically to the match
          day thread. Checks run every two minutes from three hours before kick-off.
        </p>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-lg border border-border p-4 space-y-2">
            <h2 className="font-display text-lg">Next fixture</h2>
            {data?.fixture ? (
              <>
                <p className="text-sm">
                  <span className="font-medium">{data.fixture.label}</span> · {data.fixture.competition} ·{" "}
                  {new Date(data.fixture.kickoff).toLocaleString("en-GB", {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="text-sm text-muted-foreground">
                  Match day thread: {data.topicTitle ?? "not created yet — create the thread and the sheet will post itself"}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming fixture found.</p>
            )}
            <Button size="sm" variant="outline" disabled={busy} onClick={runRecheck}>
              <RefreshCw className={`size-4 mr-1 ${busy ? "animate-spin" : ""}`} /> Check now
            </Button>
          </section>

          <section className="rounded-lg border border-border p-4 space-y-3">
            <h2 className="font-display text-lg">Posted sheets</h2>
            {data?.sheets.length ? (
              <ul className="space-y-2">
                {data.sheets.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-md border border-border p-2">
                    <img src={s.image_url} alt="Team sheet" className="h-16 w-24 rounded object-cover" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">
                        {s.is_update ? "Updated line-up" : "Line-up"} · {s.status}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(s.posted_at).toLocaleString("en-GB")}
                        {s.source_url ? (
                          <>
                            {" · "}
                            <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="underline">
                              source
                            </a>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => runRemove(s.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing posted for this fixture yet.</p>
            )}
          </section>

          <section className="rounded-lg border border-border p-4 space-y-3">
            <h2 className="font-display text-lg">Post manually</h2>
            <p className="text-sm text-muted-foreground">
              If the automatic check misses it, paste the image link (and optionally the original post link) to add it to the
              thread.
            </p>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/team-sheet.jpg" />
            <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="Original post link (optional)" />
            <Button size="sm" disabled={busy || !imageUrl.trim()} onClick={runManual}>
              Post to match day thread
            </Button>
          </section>
        </div>
      )}
    </div>
  );
}
