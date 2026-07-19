import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { Trophy, Medal, Award, Loader2, CheckCircle2, Mail } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  announcePredictionWinners,
  confirmPredictionWinnerEmail,
  getPredictionWinners,
  type PredictionWinnerRow,
} from "@/lib/prediction-winners.functions";

export type DerivedWinner = {
  place: 1 | 2 | 3;
  userId?: string;
  isGuest?: boolean;
  name?: string;
  note?: string;
};

type Props = {
  title: string;
  subtitle?: string;
  /** Auto-derived top 3 from the leaderboard when competition is finished. */
  winners?: DerivedWinner[];
  /** Competition slug — enables emailing + confirmation flow. */
  competition?: "wc2026" | "boro2026";
};

export function WinnersTab({ title, subtitle, winners = [], competition }: Props) {
  const firedRef = useRef(false);

  const qc = useQueryClient();
  const getWinners = useServerFn(getPredictionWinners);
  const announceFn = useServerFn(announcePredictionWinners);
  const confirmFn = useServerFn(confirmPredictionWinnerEmail);

  const winnersQuery = useQuery({
    queryKey: ["prediction-winners", competition],
    queryFn: () => getWinners({ data: { competition: competition! } }),
    enabled: !!competition,
    staleTime: 15_000,
  });

  const persisted: PredictionWinnerRow[] = winnersQuery.data?.winners ?? [];
  const canSeeEmails = !!winnersQuery.data?.canSeeEmails;
  const hasPersisted = persisted.length > 0;
  const derivedReady = winners.some((w) => !!w.name && !!w.userId);
  const hasWinners = hasPersisted || winners.some((w) => !!w.name);

  const [announcing, setAnnouncing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    const duration = 4000;
    const end = Date.now() + duration;
    const colors = ["#fbbf24", "#f59e0b", "#ef4444", "#22c55e", "#3b82f6", "#a855f7"];

    // Initial burst
    confetti({
      particleCount: 120,
      spread: 90,
      startVelocity: 55,
      origin: { y: 0.6 },
      colors,
    });

    // Side cannons for a few seconds
    const timer = window.setInterval(() => {
      if (Date.now() > end) {
        window.clearInterval(timer);
        return;
      }
      confetti({
        particleCount: 40,
        angle: 60,
        spread: 70,
        origin: { x: 0, y: 0.7 },
        colors,
      });
      confetti({
        particleCount: 40,
        angle: 120,
        spread: 70,
        origin: { x: 1, y: 0.7 },
        colors,
      });
    }, 350);

    return () => window.clearInterval(timer);
  }, []);

  const podium: { place: 1 | 2 | 3; label: string; Icon: typeof Trophy; ring: string; bg: string; text: string }[] = [
    { place: 1, label: "1st place", Icon: Trophy, ring: "ring-amber-400/60", bg: "from-amber-500/20 via-amber-500/5 to-transparent", text: "text-amber-300" },
    { place: 2, label: "2nd place", Icon: Medal, ring: "ring-zinc-300/50", bg: "from-zinc-300/15 via-zinc-300/5 to-transparent", text: "text-zinc-200" },
    { place: 3, label: "3rd place", Icon: Award, ring: "ring-orange-400/60", bg: "from-orange-400/20 via-orange-400/5 to-transparent", text: "text-orange-300" },
  ];

  async function handleAnnounce() {
    if (!competition) return;
    const payload = winners
      .filter((w) => !!w.userId)
      .map((w) => ({ place: w.place, userId: w.userId!, isGuest: !!w.isGuest }));
    if (payload.length === 0) {
      toast.error("No winners to announce yet.");
      return;
    }
    setAnnouncing(true);
    try {
      const res = await announceFn({ data: { competition, winners: payload } });
      toast.success(`Winners announced. Emails sent: ${res.sent}`);
      qc.invalidateQueries({ queryKey: ["prediction-winners", competition] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to announce winners");
    } finally {
      setAnnouncing(false);
    }
  }

  async function handleConfirm() {
    if (!competition) return;
    setConfirming(true);
    try {
      await confirmFn({ data: { competition } });
      toast.success("Email confirmed — thank you! 🎉");
      qc.invalidateQueries({ queryKey: ["prediction-winners", competition] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to confirm");
    } finally {
      setConfirming(false);
    }
  }

  const myRow = persisted.find((r) => r.isMe);

  return (
    <div className="rounded-2xl border-2 border-amber-400/60 bg-gradient-to-br from-amber-500/10 via-surface-1 to-surface-1 shadow-md shadow-amber-500/10 p-5 sm:p-8 space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto size-16 rounded-2xl bg-amber-500/20 grid place-items-center ring-1 ring-amber-400/40">
          <Trophy className="size-8 text-amber-300" />
        </div>
        <h2 className="font-display text-2xl sm:text-3xl font-bold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      {myRow && (
        <div className="rounded-xl border border-amber-400/50 bg-amber-500/10 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <div className="font-semibold">🎉 You're a winner!</div>
            <div className="text-muted-foreground">
              {myRow.confirmed
                ? "Your email is confirmed. Your voucher will be sent shortly."
                : "Please confirm your email so we know where to send your Amazon voucher."}
            </div>
          </div>
          {myRow.confirmed ? (
            <span className="inline-flex items-center gap-2 text-emerald-300 text-sm font-semibold">
              <CheckCircle2 className="size-4" /> Confirmed
            </span>
          ) : (
            <Button onClick={handleConfirm} disabled={confirming} className="gap-2">
              {confirming ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
              Confirm my email
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {podium.map(({ place, label, Icon, ring, bg, text }) => {
          const pRow = persisted.find((x) => x.place === place);
          const dRow = winners.find((x) => x.place === place);
          const name = pRow?.displayName ?? dRow?.name;
          const note = pRow ? undefined : dRow?.note;
          return (
            <div
              key={place}
              className={`relative rounded-2xl border border-border bg-gradient-to-b ${bg} ring-1 ${ring} p-5 flex flex-col items-center text-center gap-2`}
            >
              <Icon className={`size-8 ${text}`} />
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
              <div className="font-display text-lg font-bold min-h-7">
                {name ?? "To be announced"}
              </div>
              {note && <div className="text-xs text-muted-foreground">{note}</div>}
              {pRow && canSeeEmails && pRow.email && (
                <div className="text-[11px] text-muted-foreground break-all">{pRow.email}</div>
              )}
              {pRow && (
                <div className="mt-1">
                  {pRow.confirmed ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[11px] font-semibold">
                      <CheckCircle2 className="size-3" /> Confirmed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/20 text-zinc-200 px-2 py-0.5 text-[11px] font-semibold">
                      Awaiting email confirmation
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canSeeEmails && competition && derivedReady && (
        <div className="rounded-xl border border-border bg-surface-2/60 p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-muted-foreground">
            Admin: {hasPersisted ? "Re-send winner emails or refresh the announcement below." : "Announce these winners and email them a confirmation link."}
          </div>
          <Button size="sm" onClick={handleAnnounce} disabled={announcing} className="gap-2">
            {announcing ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            {hasPersisted ? "Re-send winner emails" : "Announce & email winners"}
          </Button>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        {hasWinners
          ? "Final winners are pulled from the leaderboard. Congratulations! 🎉"
          : "Winners will appear here automatically once all matches are complete. Good luck! 🍀"}
      </p>
    </div>
  );
}
