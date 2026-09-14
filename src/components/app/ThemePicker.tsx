import { Check, Loader2, Palette } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppTheme } from "@/hooks/use-app-theme";

export const APP_THEME_OPTIONS: Array<{
  value: AppTheme;
  name: string;
  description: string;
  swatches: string[];
}> = [
  { value: "purple", name: "Vibrant Purple", description: "The original BM Support colour scheme.", swatches: ["#7c3aed", "#a855f7", "#3b82f6", "#ec4899"] },
  { value: "red", name: "Crimson & Rose", description: "Bold crimson with warm rose highlights.", swatches: ["#dc2626", "#ef4444", "#f43f5e", "#fb7185"] },
  { value: "ocean", name: "Electric Ocean", description: "Bright cyan, teal and ocean blue.", swatches: ["#0891b2", "#06b6d4", "#22d3ee", "#5eead4"] },
  { value: "sunset", name: "Sunset Blaze", description: "Warm orange, amber and pink accents.", swatches: ["#ea580c", "#f97316", "#f59e0b", "#ec4899"] },
  { value: "pink", name: "Pink Pulse", description: "Colourful bright pink from edge to edge.", swatches: ["#831843", "#db2777", "#f472b6", "#fbcfe8"] },
  { value: "berry", name: "Berry Glass", description: "Deep berry glass with hot-pink highlights.", swatches: ["#500724", "#9d174d", "#ec4899", "#f9a8d4"] },
];

interface ThemePickerProps {
  current: AppTheme;
  onChoose: (theme: AppTheme) => Promise<void>;
  title: string;
  description: string;
}

export function ThemePicker({ current, onChoose, title, description }: ThemePickerProps) {
  const [busy, setBusy] = useState<AppTheme | null>(null);

  const choose = async (theme: AppTheme) => {
    if (theme === current || busy) return;
    setBusy(theme);
    try {
      await onChoose(theme);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-primary/40 bg-card/90 p-5 shadow-glow sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow">
          <Palette className="size-5" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {APP_THEME_OPTIONS.map((option) => {
          const active = current === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void choose(option.value)}
              aria-pressed={active}
              className={cn(
                "h-auto min-h-36 items-stretch justify-start whitespace-normal p-4 text-left",
                active ? "border-primary bg-primary/10 shadow-glow" : "bg-background/55 hover:border-primary/60 hover:bg-accent/40",
              )}
            >
              <span className="flex w-full flex-col">
                <span className="mb-3 flex items-center justify-between gap-2">
                  <span className="font-display font-bold text-foreground">{option.name}</span>
                  {busy === option.value ? (
                    <Loader2 className="size-4 animate-spin text-primary" />
                  ) : active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] uppercase text-primary-foreground">
                      <Check className="size-3" /> Active
                    </span>
                  ) : null}
                </span>
                <span className="mb-3 text-xs font-normal text-muted-foreground">{option.description}</span>
                <span className="mt-auto flex gap-1.5" aria-hidden>
                  {option.swatches.map((colour) => (
                    <span key={colour} className="h-7 flex-1 rounded-sm ring-1 ring-foreground/15" style={{ backgroundColor: colour }} />
                  ))}
                </span>
              </span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}