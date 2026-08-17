import { memo, useEffect, useState } from "react";
import { BarChart3, CalendarClock, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type PollRow = {
  id: string;
  topic_id: string;
  question: string;
  allow_multiple: boolean;
  closes_at: string | null;
  created_by: string;
};
type OptionRow = { id: string; poll_id: string; label: string; sort_order: number };
type VoteRow = { poll_id: string; option_id: string; user_id: string };

function ForumPollComponent({
  topicId,
  userId,
  canManage,
  canVote,
}: {
  topicId: string;
  userId: string | null;
  canManage: boolean;
  canVote: boolean;
}) {
  const [poll, setPoll] = useState<PollRow | null>(null);
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftPoll | null>(null);
  const [draftIds, setDraftIds] = useState<(string | null)[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data: p } = await supabase
      .from("forum_polls")
      .select("id, topic_id, question, allow_multiple, closes_at, created_by")
      .eq("topic_id", topicId)
      .maybeSingle();
    if (!p) { setPoll(null); setOptions([]); setVotes([]); setLoading(false); return; }
    setPoll(p as PollRow);
    const [{ data: opts }, { data: vs }] = await Promise.all([
      supabase.from("forum_poll_options").select("id, poll_id, label, sort_order").eq("poll_id", (p as PollRow).id).order("sort_order"),
      supabase.from("forum_poll_votes").select("poll_id, option_id, user_id").eq("poll_id", (p as PollRow).id),
    ]);
    setOptions((opts ?? []) as OptionRow[]);
    setVotes((vs ?? []) as VoteRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`forum-poll-${topicId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "forum_poll_votes" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "forum_polls", filter: `topic_id=eq.${topicId}` }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  if (loading || !poll) return null;

  const totalVotes = votes.length;
  const myVotes = userId ? new Set(votes.filter((v) => v.user_id === userId).map((v) => v.option_id)) : new Set<string>();
  const closed = !!poll.closes_at && new Date(poll.closes_at).getTime() < Date.now();

  const vote = async (optionId: string) => {
    if (!userId || busy) return;
    setBusy(true);
    const had = myVotes.has(optionId);
    if (poll.allow_multiple) {
      if (had) {
        await supabase.from("forum_poll_votes").delete().eq("poll_id", poll.id).eq("option_id", optionId).eq("user_id", userId);
      } else {
        await supabase.from("forum_poll_votes").insert({ poll_id: poll.id, option_id: optionId, user_id: userId });
      }
    } else {
      // Single-choice: clear existing, set this one (unless toggling off).
      await supabase.from("forum_poll_votes").delete().eq("poll_id", poll.id).eq("user_id", userId);
      if (!had) {
        const { error } = await supabase.from("forum_poll_votes").insert({ poll_id: poll.id, option_id: optionId, user_id: userId });
        if (error) toast.error("Couldn't vote", { description: error.message });
      }
    }
    setBusy(false);
    void load();
  };

  const removePoll = async () => {
    if (!confirm("Delete this poll and all its votes?")) return;
    const { error } = await supabase.from("forum_polls").delete().eq("id", poll.id);
    if (error) { toast.error("Couldn't delete", { description: error.message }); return; }
    void load();
  };

  const startEdit = () => {
    setDraft({
      question: poll.question,
      options: options.map((o) => o.label),
      allow_multiple: poll.allow_multiple,
      closes_at: poll.closes_at
        ? new Date(new Date(poll.closes_at).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
        : "",
    });
    setDraftIds(options.map((o) => o.id));
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setDraft(null); setDraftIds([]); };

  const saveEdit = async () => {
    if (!draft) return;
    const question = draft.question.trim();
    const labels = draft.options.map((o) => o.trim());
    if (!question) { toast.error("Add a poll question"); return; }
    if (labels.filter((l) => l.length > 0).length < 2) { toast.error("Add at least two options"); return; }
    let closesAt: string | null = null;
    if (draft.closes_at) {
      const ms = new Date(draft.closes_at).getTime();
      if (isNaN(ms)) { toast.error("That poll end date isn't valid"); return; }
      closesAt = new Date(ms).toISOString();
    }
    setSaving(true);
    const { error: pErr } = await supabase
      .from("forum_polls")
      .update({ question, allow_multiple: draft.allow_multiple, closes_at: closesAt })
      .eq("id", poll.id);
    if (pErr) { setSaving(false); toast.error("Couldn't save poll", { description: pErr.message }); return; }

    // Options: update kept ones, insert new ones, delete removed ones.
    const keptIds: string[] = [];
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      const id = draftIds[i] ?? null;
      if (!label) {
        continue;
      }
      if (id) {
        keptIds.push(id);
        const { error } = await supabase.from("forum_poll_options").update({ label, sort_order: i }).eq("id", id);
        if (error) { setSaving(false); toast.error("Couldn't save options", { description: error.message }); return; }
      } else {
        const { error } = await supabase.from("forum_poll_options").insert({ poll_id: poll.id, label, sort_order: i });
        if (error) { setSaving(false); toast.error("Couldn't add option", { description: error.message }); return; }
      }
    }
    const removed = options.filter((o) => !keptIds.includes(o.id)).map((o) => o.id);
    if (removed.length) {
      const { error } = await supabase.from("forum_poll_options").delete().in("id", removed);
      if (error) { setSaving(false); toast.error("Couldn't remove options", { description: error.message }); return; }
    }
    setSaving(false);
    cancelEdit();
    toast.success("Poll updated");
    void load();
  };

  if (editing && draft) {
    return (
      <section className="rounded-2xl border border-[#E11B22]/40 bg-gradient-to-br from-surface-1 to-surface-2/60 p-4 sm:p-5 shadow-soft space-y-2">
        <PollDraftEditor
          value={draft}
          title="Edit poll"
          allowPastEnd
          onChange={(next) => {
            // Keep option ids aligned with the draft option list.
            setDraftIds((prev) => {
              const ids = [...prev];
              while (ids.length < next.options.length) ids.push(null);
              return ids.slice(0, next.options.length);
            });
            setDraft(next);
          }}
          onRemoveOptionAt={(i) => setDraftIds((prev) => prev.filter((_, idx) => idx !== i))}
          onRemove={cancelEdit}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>Cancel</Button>
          <Button type="button" size="sm" onClick={() => void saveEdit()} disabled={saving}>
            {saving ? <><Loader2 className="size-4 mr-1 animate-spin" />Saving…</> : "Save changes"}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[#E11B22]/40 bg-gradient-to-br from-surface-1 to-surface-2/60 p-4 sm:p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className="size-4 text-[#E11B22] shrink-0" />
          <h3 className="font-display font-bold text-sm sm:text-base truncate">{poll.question}</h3>
        </div>
        {canManage && (
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-[#E11B22]" onClick={startEdit} title="Edit poll">
              <Pencil className="size-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive/80 hover:text-destructive" onClick={() => void removePoll()} title="Delete poll">
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
      <div className="space-y-2">
        {options.map((o) => {
          const count = votes.filter((v) => v.option_id === o.id).length;
          const pct = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
          const mine = myVotes.has(o.id);
          const disabled = !canVote || !userId || closed || busy;
          return (
            <button
              key={o.id}
              type="button"
              disabled={disabled}
              onClick={() => void vote(o.id)}
              className={`relative w-full text-left rounded-lg border overflow-hidden transition-colors ${
                mine ? "border-[#E11B22] bg-[#E11B22]/10" : "border-border hover:border-[#E11B22]/50 bg-surface-1"
              } ${disabled ? "cursor-default" : "cursor-pointer"}`}
            >
              <span
                aria-hidden
                className={`absolute inset-y-0 left-0 ${mine ? "bg-[#E11B22]/25" : "bg-surface-2"}`}
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="font-medium truncate">{o.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground shrink-0">{pct}% · {count}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
        <span>{totalVotes} vote{totalVotes === 1 ? "" : "s"}</span>
        {poll.allow_multiple && <span>· Multiple choice</span>}
        {closed ? <span>· Closed {poll.closes_at ? new Date(poll.closes_at).toLocaleString() : ""}</span> : poll.closes_at && <span>· Closes {new Date(poll.closes_at).toLocaleString()}</span>}
        {!canVote && !canManage && <span>· Members only</span>}
      </div>
    </section>
  );
}

export const ForumPoll = memo(ForumPollComponent);

export type DraftPoll = {
  question: string;
  options: string[];
  allow_multiple: boolean;
  /** Local datetime-local string, e.g. "2026-08-20T18:30". Empty/undefined = no end time. */
  closes_at?: string;
};

export function PollDraftEditor({ value, onChange, onRemove }: { value: DraftPoll; onChange: (next: DraftPoll) => void; onRemove: () => void }) {
  const update = (patch: Partial<DraftPoll>) => onChange({ ...value, ...patch });
  const setOption = (i: number, v: string) => {
    const next = [...value.options];
    next[i] = v;
    update({ options: next });
  };
  const addOption = () => update({ options: [...value.options, ""] });
  const removeOption = (i: number) => update({ options: value.options.filter((_, idx) => idx !== i) });
  const minLocal = new Date(Date.now() + 60_000 - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

  return (
    <div className="rounded-xl border border-[#E11B22]/30 bg-background/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BarChart3 className="size-4 text-[#E11B22]" /> Add a poll
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}><X className="size-3.5" /></Button>
      </div>
      <Input
        placeholder="Poll question"
        value={value.question}
        onChange={(e) => update({ question: e.target.value.slice(0, 200) })}
        maxLength={200}
      />
      <div className="space-y-1.5">
        {value.options.map((opt, i) => (
          <div key={i} className="flex gap-1.5">
            <Input
              placeholder={`Option ${i + 1}`}
              value={opt}
              onChange={(e) => setOption(i, e.target.value.slice(0, 120))}
              maxLength={120}
            />
            {value.options.length > 2 && (
              <Button type="button" size="sm" variant="ghost" className="h-9 px-2" onClick={() => removeOption(i)}>
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button type="button" size="sm" variant="outline" onClick={addOption} disabled={value.options.length >= 10}>
          <Plus className="size-3.5 mr-1" /> Add option
        </Button>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={value.allow_multiple}
            onChange={(e) => update({ allow_multiple: e.target.checked })}
          />
          Allow multiple choices
        </label>
      </div>
      <div className="space-y-1.5 pt-1 border-t border-border/60">
        <label className="flex items-center gap-1.5 text-xs font-medium" htmlFor="poll-closes-at">
          <CalendarClock className="size-3.5 text-[#E11B22]" /> Poll end date &amp; time (optional)
        </label>
        <div className="flex gap-1.5 items-center">
          <Input
            id="poll-closes-at"
            type="datetime-local"
            min={minLocal}
            value={value.closes_at ?? ""}
            onChange={(e) => update({ closes_at: e.target.value })}
          />
          {value.closes_at && (
            <Button type="button" size="sm" variant="ghost" className="h-9 px-2" onClick={() => update({ closes_at: "" })} title="Clear end time">
              <X className="size-3.5" />
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {value.closes_at ? `Voting closes ${new Date(value.closes_at).toLocaleString()}` : "Leave blank to keep the poll open indefinitely."}
        </p>
      </div>
    </div>
  );
}

export async function persistDraftPoll(topicId: string, userId: string, draft: DraftPoll): Promise<string | null> {
  const question = draft.question.trim();
  const options = draft.options.map((o) => o.trim()).filter((o) => o.length > 0);
  if (!question || options.length < 2) return "Add a question and at least two options";
  let closesAt: string | null = null;
  if (draft.closes_at) {
    const ms = new Date(draft.closes_at).getTime();
    if (isNaN(ms)) return "That poll end date isn't valid";
    if (ms <= Date.now()) return "The poll end time must be in the future";
    closesAt = new Date(ms).toISOString();
  }
  const { data: poll, error } = await supabase
    .from("forum_polls")
    .insert({ topic_id: topicId, question, allow_multiple: draft.allow_multiple, closes_at: closesAt, created_by: userId })
    .select("id")
    .single();
  if (error || !poll) return error?.message ?? "Couldn't create poll";
  const rows = options.map((label, i) => ({ poll_id: (poll as { id: string }).id, label, sort_order: i }));
  const { error: oErr } = await supabase.from("forum_poll_options").insert(rows);
  if (oErr) return oErr.message;
  return null;
}

/**
 * "Add poll" control for an existing topic (reply editor). Only renders when the
 * topic has no poll yet.
 */
export function AddPollToTopic({ topicId, userId }: { topicId: string; userId: string }) {
  const [exists, setExists] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<DraftPoll | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.from("forum_polls").select("id").eq("topic_id", topicId).maybeSingle();
      if (active) setExists(!!data);
    })();
    return () => { active = false; };
  }, [topicId]);

  if (exists !== false) return null;

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const err = await persistDraftPoll(topicId, userId, draft);
    setSaving(false);
    if (err) { toast.error("Couldn't add poll", { description: err }); return; }
    toast.success("Poll added to this topic");
    setDraft(null);
    setExists(true);
  };

  if (!draft) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-[#E11B22]/40 hover:bg-[#E11B22]/10"
        onClick={() => setDraft({ question: "", options: ["", ""], allow_multiple: false })}
      >
        <BarChart3 className="size-4 mr-1 text-[#E11B22]" /> Add poll
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <PollDraftEditor value={draft} onChange={setDraft} onRemove={() => setDraft(null)} />
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? <><Loader2 className="size-4 mr-1 animate-spin" />Saving…</> : "Save poll"}
        </Button>
      </div>
    </div>
  );
}