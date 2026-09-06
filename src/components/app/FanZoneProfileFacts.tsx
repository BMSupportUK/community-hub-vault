import { CalendarDays, Heart, Quote } from "lucide-react";

type Props = {
  bio?: string | null;
  supporterSince?: number | null;
  favPlayer?: string | null;
  matchdayMemory?: string | null;
};

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
    <section className="fan-profile-facts">
      <div className={`fan-profile-facts__bio ${facts.length > 0 ? "fan-profile-facts__bio--with-cards" : ""}`}>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-red-100/80">Bio</div>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white">
          {bio || "No bio added yet."}
        </p>
      </div>
      {facts.length > 0 && (
        <div
          className={`fan-profile-facts__cards ${facts.length === 1 ? "sm:grid-cols-1" : facts.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}
        >
          {facts.map((f) => {
            const Icon = f.icon;
            return (
              <article key={f.key} className="fan-profile-facts__card group">
                <div className="fan-profile-facts__icon">
                  <Icon className="size-6 text-red-50" strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-red-100/70">{f.label}</div>
                  <p
                    className={`mt-1 break-words text-sm font-bold leading-snug text-white ${f.italic ? "font-normal italic" : ""}`}
                  >
                    {f.value}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default FanZoneProfileFacts;
