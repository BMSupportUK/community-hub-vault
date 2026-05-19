import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Monitor, Tablet, Laptop, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_approved/responsive-check")({
  component: ResponsiveCheckPage,
});

const PAGES: { label: string; path: string }[] = [
  { label: "Home / Chat", path: "/home" },
  { label: "Tickets", path: "/tickets" },
  { label: "Shop", path: "/shop" },
  { label: "Members", path: "/members" },
  { label: "Staff", path: "/staff" },
  { label: "Admin", path: "/admin" },
  { label: "Moderation", path: "/moderation" },
  { label: "Knowledge base", path: "/knowledge-base" },
  { label: "Leaderboard", path: "/leaderboard" },
  { label: "Status", path: "/status" },
];

const WIDTHS: { label: string; w: number; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "iPad portrait", w: 768, icon: Tablet },
  { label: "iPad landscape", w: 1024, icon: Tablet },
  { label: "13\" laptop", w: 1280, icon: Laptop },
  { label: "Desktop", w: 1536, icon: Monitor },
];

function ResponsiveCheckPage() {
  const [path, setPath] = useState(PAGES[0].path);
  const [width, setWidth] = useState(WIDTHS[0].w);
  const [height, setHeight] = useState(900);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-background">
      <div className="border-b border-border bg-rail/40 backdrop-blur px-4 py-3 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-lg font-bold leading-tight">Responsive check</h1>
          <p className="text-xs text-muted-foreground">Preview any page at common tablet/laptop widths.</p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="h-9 rounded-md bg-surface-2 border border-border px-2 text-sm"
          >
            {PAGES.map((p) => (
              <option key={p.path} value={p.path}>{p.label}</option>
            ))}
          </select>

          <div className="flex items-center gap-1 rounded-md bg-surface-2 border border-border p-1">
            {WIDTHS.map(({ label, w, icon: Icon }) => (
              <button
                key={w}
                onClick={() => setWidth(w)}
                title={`${label} — ${w}px`}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors",
                  width === w
                    ? "bg-primary text-primary-foreground shadow-glow"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {w}
              </button>
            ))}
          </div>

          <label className="text-xs text-muted-foreground flex items-center gap-1">
            H
            <input
              type="number"
              value={height}
              min={400}
              step={50}
              onChange={(e) => setHeight(Number(e.target.value) || 900)}
              className="h-9 w-20 rounded-md bg-surface-2 border border-border px-2 text-sm"
            />
          </label>

          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="h-9 px-3 rounded-md bg-surface-2 border border-border text-xs font-medium hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
          >
            Reload
          </button>

          <a
            href={path}
            target="_blank"
            rel="noreferrer"
            className="h-9 px-3 rounded-md bg-surface-2 border border-border text-xs font-medium hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors inline-flex items-center gap-1.5"
          >
            <ExternalLink className="size-3.5" />
            Open
          </a>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 grid place-items-start">
        <div
          className="bg-background rounded-lg border border-border shadow-2xl overflow-hidden mx-auto"
          style={{ width: `${width}px`, height: `${height}px`, maxWidth: "100%" }}
        >
          <div className="h-7 bg-rail/60 border-b border-border flex items-center gap-1.5 px-3">
            <span className="size-2.5 rounded-full bg-red-500/70" />
            <span className="size-2.5 rounded-full bg-amber-500/70" />
            <span className="size-2.5 rounded-full bg-emerald-500/70" />
            <span className="ml-3 text-[11px] text-muted-foreground font-mono truncate">
              {path} · {width}×{height}
            </span>
          </div>
          <iframe
            key={`${path}-${width}-${reloadKey}`}
            src={path}
            title={`Preview ${path} at ${width}px`}
            className="w-full bg-background"
            style={{ height: `${height - 28}px` }}
          />
        </div>
      </div>
    </main>
  );
}