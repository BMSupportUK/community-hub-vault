import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Loader2, Pencil, Plus, Search, Trash2, Users2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useChannelJump } from "@/components/app/ChannelJump";

export interface QuickReply {
  id: string;
  user_id: string;
  code: string;
  body: string;
  shared: boolean;
}

const STAFF_ROLES = ["admin", "management", "moderator", "staff"] as const;

/** Loads the quick replies the signed-in staff member can use. */
export function useQuickReplies() {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny([...STAFF_ROLES]);
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || !isStaff) return;
    setLoading(true);
    const { data } = await supabase
      .from("staff_quick_replies")
      .select("id, user_id, code, body, shared")
      .order("code", { ascending: true });
    setReplies((data ?? []) as QuickReply[]);
    setLoading(false);
  }, [user?.id, isStaff]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Expands a trailing "/code" token in the draft, if one matches. */
  const expand = useCallback(
    (text: string): string | null => {
      const m = /(?:^|\s)\/([a-zA-Z0-9_-]+)$/.exec(text);
      if (!m) return null;
      const hit = replies.find((r) => r.code.toLowerCase() === m[1].toLowerCase());
      if (!hit) return null;
      return text.slice(0, text.length - m[1].length - 1) + hit.body;
    },
    [replies],
  );

  return { replies, loading, refresh, isStaff, expand };
}

/**
 * Staff-only pill + dialogue that stores short codes with canned sentences and
 * drops the chosen sentence straight into the message bar.
 */
export function QuickRepliesPill({
  onInsert,
  className,
}: {
  onInsert: (text: string) => void;
  className?: string;
}) {
  const { user } = useAuth();
  const { replies, loading, refresh, isStaff } = useQuickReplies();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<QuickReply | "new" | null>(null);
  const [code, setCode] = useState("");
  const [body, setBody] = useState("");
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // `#` command inside the shortcut text so saved replies can share channel/page links.
  const bodyJump = useChannelJump({ value: body, onChange: setBody, editorRef: bodyRef });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return replies;
    return replies.filter(
      (r) => r.code.toLowerCase().includes(q) || r.body.toLowerCase().includes(q),
    );
  }, [replies, query]);

  if (!isStaff) return null;

  const startEdit = (r: QuickReply | "new") => {
    setEditing(r);
    setCode(r === "new" ? "" : r.code);
    setBody(r === "new" ? "" : r.body);
    setShared(r === "new" ? false : r.shared);
  };

  const save = async () => {
    const cleanCode = code.trim().replace(/^\//, "").replace(/\s+/g, "-");
    if (!cleanCode || !body.trim() || !user) return;
    setSaving(true);
    const payload = { user_id: user.id, code: cleanCode, body: body.trim(), shared };
    const { error } =
      editing && editing !== "new"
        ? await supabase.from("staff_quick_replies").update(payload).eq("id", editing.id)
        : await supabase.from("staff_quick_replies").insert(payload);
    setSaving(false);
    if (error) return toast.error("Couldn't save shortcut", { description: error.message });
    setEditing(null);
    setCode("");
    setBody("");
    setShared(false);
    await refresh();
  };

  const remove = async (r: QuickReply) => {
    const { error } = await supabase.from("staff_quick_replies").delete().eq("id", r.id);
    if (error) return toast.error("Couldn't delete shortcut", { description: error.message });
    await refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Staff quick replies — saved short codes"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300 transition-colors hover:bg-amber-500/25",
          className,
        )}
      >
        <Keyboard className="size-3.5" />
        Shortcuts
        {replies.length > 0 && (
          <span className="rounded-full bg-amber-500/25 px-1.5 tabular-nums">{replies.length}</span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="size-5 text-amber-400" /> Staff quick replies
            </DialogTitle>
            <DialogDescription>
              Pick a shortcut to drop the sentence into the message bar, or type{" "}
              <code className="rounded bg-surface-2 px-1">/code</code> in chat and press space to
              expand it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search codes or text…"
                className="pl-8"
              />
            </div>
            <Button type="button" size="sm" onClick={() => startEdit("new")}>
              <Plus className="size-4" /> New
            </Button>
          </div>

          {editing && (
            <div className="space-y-2 rounded-lg border border-border bg-surface-2/60 p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">/</span>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="short-code"
                  className="h-8 flex-1"
                />
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="grid size-8 place-items-center rounded-md hover:bg-surface-2"
                  aria-label="Cancel"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="relative">
                <Textarea
                  ref={bodyRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (bodyJump.onKeyDown(e)) return;
                  }}
                  rows={3}
                  placeholder="The sentence this shortcut types for you… type # to add a channel or page link"
                  className="resize-none"
                />
                {bodyJump.dropdown}
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={shared}
                  onChange={(e) => setShared(e.target.checked)}
                />
                Share with the rest of the staff team
              </label>
              <Button
                type="button"
                size="sm"
                onClick={() => void save()}
                disabled={saving || !code.trim() || !body.trim()}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null} Save shortcut
              </Button>
            </div>
          )}

          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {loading ? (
              <div className="grid place-items-center py-8 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                No shortcuts yet — add your first one above.
              </p>
            ) : (
              filtered.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start gap-2 rounded-lg border border-border bg-surface-2/40 p-2"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onInsert(r.body);
                      setOpen(false);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-300">
                        /{r.code}
                      </span>
                      {r.shared && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <Users2 className="size-3" /> shared
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-foreground/90">{r.body}</p>
                  </button>
                  {r.user_id === user?.id && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(r)}
                        className="grid size-7 place-items-center rounded-md hover:bg-surface-2"
                        aria-label="Edit shortcut"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(r)}
                        className="grid size-7 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                        aria-label="Delete shortcut"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
