import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, MailQuestion } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitFanZoneAppeal } from "@/lib/fan-zone-appeals.functions";
import { formatLastSeen } from "@/lib/relative-time";

type Msg = { id: string; from_staff: boolean; body: string; created_at: string };

type Props = {
  /** Called when the panel discovers whether the user already has an appeal open. */
  onAppealKnown?: (hasAppeal: boolean) => void;
};

/**
 * The appeal form and thread shown on the Fan Zone ban screen: the member
 * writes their appeal here and sees the moderator's replies in the same place.
 */
export function FanZoneAppealPanel({ onAppealKnown }: Props) {
  const { user } = useAuth();
  const send = useServerFn(submitFanZoneAppeal);
  const [appealId, setAppealId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data: appeal } = await supabase
      .from("fan_zone_appeals")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!appeal) {
      setAppealId(null);
      setMsgs([]);
      return;
    }
    setAppealId(appeal.id);
    const { data } = await supabase
      .from("fan_zone_appeal_messages")
      .select("id, from_staff, body, created_at")
      .eq("appeal_id", appeal.id)
      .order("created_at", { ascending: true });
    setMsgs((data ?? []) as Msg[]);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live: a moderator's reply appears without a refresh.
  useEffect(() => {
    if (!appealId) return;
    const ch = supabase
      .channel(`fz-appeal-${appealId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "fan_zone_appeal_messages", filter: `appeal_id=eq.${appealId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [appealId, load]);

  // Safety net: if the live connection drops, still pick replies up quickly.
  useEffect(() => {
    if (!user?.id) return;
    const t = setInterval(() => void load(), 15_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [user?.id, load]);

  const submit = async () => {
    const text = body.trim();
    if (text.length < 10) {
      toast.error("Please write a bit more so a moderator can look into it.");
      return;
    }
    setBusy(true);
    try {
      await send({ data: { body: text } });
      setBody("");
      toast.success("Appeal sent — a moderator will read it.");
      await load();
    } catch (err) {
      toast.error("Couldn't send your appeal", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/15 bg-black/30 px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">
        <MailQuestion className="size-3.5" />
        Appeal this ban
      </div>

      {msgs === null ? (
        <div className="grid place-items-center py-4">
          <Loader2 className="size-4 animate-spin text-white/50" />
        </div>
      ) : msgs.length > 0 ? (
        <ul className="space-y-2">
          {msgs.map((m) => (
            <li
              key={m.id}
              className={`rounded-lg border px-3 py-2 text-sm ${
                m.from_staff
                  ? "border-emerald-400/40 bg-emerald-500/10 text-white"
                  : "border-white/15 bg-white/5 text-white/85"
              }`}
            >
              <div className="mb-1 text-[10px] uppercase tracking-widest text-white/45">
                {m.from_staff ? "Moderator" : "You"} · {formatLastSeen(m.created_at)}
              </div>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-white/55">
          Think this is a mistake? Tell us what happened and a moderator will take another look.
        </p>
      )}

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder={msgs && msgs.length ? "Add another message…" : "Explain what happened…"}
        className="border-white/20 bg-black/40 text-white placeholder:text-white/40"
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => void submit()}
          className="bg-[#E11B22] text-white hover:bg-[#c5161c]"
        >
          {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Send className="mr-1.5 size-4" />}
          {msgs && msgs.length ? "Send message" : "Send appeal"}
        </Button>
      </div>
      <p className="text-center text-[11px] text-white/40">
        We'll email you when a moderator replies.
      </p>
    </div>
  );
}
