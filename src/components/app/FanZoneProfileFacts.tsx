import { CalendarDays, Heart, Quote } from "lucide-react";

type Props = {
  bio?: string | null;
  supporterSince?: number | null;
  favPlayer?: string | null;
  matchdayMemory?: string | null;
};

/**
 * Bio panel with square fact tiles blended into the bottom edge of the box,
 * matching the stat-box look used on the BM Support landing page.
 */
export function FanZoneProfileFacts({ bio, supporterSince, favPlayer, matchdayMemory }: Props) {
  const facts = [
    supporterSince
      ? { key: "since", icon: CalendarDays, label: "Supporter since", value: String(supporterSince), italic: false }
      : null,
    favPlayer ? { key: "player", icon: Heart, label: "Favourite player", value: favPlayer, italic: false } : null,
    matchdayMemory
      ? { key: "memory", icon: Quote, label: "Matchday memory", value: `"${matchdayMemory}"`, italic: true }
      : null,
  ].filter(Boolean) as { key: string; icon: typeof Heart; label: string; value: string; italic: boolean }[];

  if (!bio && facts.length === 0) {
    return <p className="text-sm italic text-white/60">No profile info yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/15 bg-white/[0.04]">
      {bio && (
        <div className="p-4">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/70">Bio</div>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white">{bio}</p>
        </div>
      )}
      {facts.length > 0 && (
        <div
          className={`grid gap-px bg-white/10 ${facts.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"} ${bio ? "border-t border-white/10" : ""}`}
        >
          {facts.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.key}
                className="flex aspect-square min-h-[120px] flex-col justify-between bg-black/40 p-3 text-white transition-colors hover:bg-[#E11B22]/10"
              >
                <Icon className="size-4 shrink-0 text-[#E11B22]" />
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60">{f.label}</div>
                  <p
                    className={`mt-0.5 break-words text-sm font-semibold leading-snug line-clamp-4 ${f.italic ? "font-normal italic" : ""}`}
                  >
                    {f.value}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default FanZoneProfileFacts;
