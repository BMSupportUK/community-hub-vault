import { useEffect, useMemo, useState } from "react";
import halloweenArt from "@/assets/talk-halloween-bg.jpg";
import christmasArt from "@/assets/talk-christmas-bg.jpg";
import { getSeason, type Season } from "@/lib/seasonal-theme";

/** Decorative, non-interactive seasonal overlay for Talk channels. */
export function SeasonalEffects() {
  const [season, setSeason] = useState<Season | null>(null);
  useEffect(() => {
    setSeason(getSeason());
    const id = window.setInterval(() => setSeason(getSeason()), 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const particles = useMemo(() => {
    const count = season === "christmas" ? 40 : 12;
    return Array.from({ length: count }, (_, i) => ({
      left: (i * 97) % 100,
      delay: -((i * 37) % 20),
      duration: season === "christmas" ? 10 + ((i * 13) % 10) : 18 + ((i * 7) % 12),
      size: season === "christmas" ? 4 + ((i * 5) % 6) : 18 + ((i * 3) % 10),
      glyph: season === "halloween" ? (i % 3 === 0 ? "🎃" : "🦇") : "",
    }));
  }, [season]);

  if (!season) return null;

  return (
    <div aria-hidden className={`seasonal-fx seasonal-fx--${season}`}>
      <div
        className="seasonal-fx__art"
        style={{ backgroundImage: `url(${season === "christmas" ? christmasArt : halloweenArt})` }}
      />
      <div className="seasonal-fx__glow" />
      {particles.map((p, i) => (
        <span
          key={i}
          className="seasonal-fx__particle"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            fontSize: `${p.size}px`,
            width: season === "christmas" ? p.size : undefined,
            height: season === "christmas" ? p.size : undefined,
          }}
        >
          {p.glyph}
        </span>
      ))}
    </div>
  );
}
