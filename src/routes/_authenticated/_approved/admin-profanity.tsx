import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Filter, Loader2, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import {
  DEFAULT_UK_PROFANITY,
  censorText,
  ensureProfanityLoaded,
  getCustomProfanityWords,
  saveCustomProfanityWords,
} from "@/lib/profanity";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/admin-profanity")({
  component: AdminProfanityPage,
});

function AdminProfanityPage() {
  const { hasAny, user } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [loading, setLoading] = useState(true);
  const [custom, setCustom] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      await ensureProfanityLoaded();
      setCustom(getCustomProfanityWords().sort());
      setLoading(false);
    })();
  }, [isAdmin]);

  const sortedDefaults = useMemo(
    () => [...DEFAULT_UK_PROFANITY].map((w) => w.toLowerCase()).sort(),
    [],
  );

  if (!isAdmin) return <Navigate to="/home" />;
  if (!isAdminUnlocked(user?.id)) {
    return <Navigate to="/admin" search={{ next: "/admin-profanity" } as never} />;
  }

  const persist = async (next: string[]) => {
    setSaving(true);
    try {
      await saveCustomProfanityWords(next);
      setCustom([...next].sort());
      toast.success("Word filter updated");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const addWords = async () => {
    const tokens = draft
      .split(/[\s,;\n]+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 0 && w.length <= 64);
    if (tokens.length === 0) return;
    const merged = Array.from(new Set([...custom, ...tokens]));
    setDraft("");
    await persist(merged);
  };

  const removeWord = async (w: string) => {
    await persist(custom.filter((x) => x !== w));
  };

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="size-9 rounded-xl border border-border bg-surface-1 grid place-items-center hover:bg-surface-2">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="size-11 rounded-2xl bg-gradient-primary grid place-items-center text-primary-foreground shadow-glow">
            <Filter className="size-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Chat word filter</h1>
            <p className="text-sm text-muted-foreground">
              Words listed here are replaced with stars in every chat channel and ticket.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid place-items-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-border bg-surface-1 p-5">
              <h2 className="font-display font-bold mb-1">Add custom words</h2>
              <p className="text-xs text-muted-foreground mb-3">
                Separate with commas, spaces, or new lines. Matching tolerates leetspeak (e.g. <code>f*ck</code>, <code>fück</code>).
              </p>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="word1, word2, word3"
                className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm font-mono"
              />
              <button
                onClick={addWords}
                disabled={saving || draft.trim().length === 0}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
              >
                <Plus className="size-4" /> Add to filter
              </button>
            </section>

            <section className="rounded-2xl border border-border bg-surface-1 p-5">
              <h2 className="font-display font-bold mb-3">
                Custom words <span className="text-muted-foreground text-sm font-normal">({custom.length})</span>
              </h2>
              {custom.length === 0 ? (
                <p className="text-sm text-muted-foreground">No custom words yet — the built-in UK list is active.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {custom.map((w) => (
                    <span
                      key={w}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-border text-sm"
                    >
                      <code className="font-mono">{w}</code>
                      <button
                        onClick={() => removeWord(w)}
                        disabled={saving}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                        aria-label={`Remove ${w}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-surface-1 p-5">
              <h2 className="font-display font-bold mb-1">Preview</h2>
              <p className="text-xs text-muted-foreground mb-3">Type a sample message to see what members will see.</p>
              <input
                value={preview}
                onChange={(e) => setPreview(e.target.value)}
                placeholder="Try a sentence…"
                className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm"
              />
              {preview && (
                <div className="mt-3 p-3 rounded-lg bg-surface-2 border border-border text-sm whitespace-pre-wrap">
                  {censorText(preview)}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-surface-1 p-5">
              <h2 className="font-display font-bold mb-3">
                Built-in UK list <span className="text-muted-foreground text-sm font-normal">({sortedDefaults.length})</span>
              </h2>
              <p className="text-xs text-muted-foreground mb-3">These are always active and cannot be removed.</p>
              <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
                {sortedDefaults.map((w) => (
                  <code
                    key={w}
                    className="px-2 py-0.5 rounded bg-surface-2 border border-border text-xs font-mono text-muted-foreground"
                  >
                    {w}
                  </code>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}