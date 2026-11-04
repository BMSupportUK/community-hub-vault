import { Download, Monitor } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useIsDemoAccount } from "@/hooks/use-demo-account";

export function WindowsPlayerDownload() {
  const isDemo = useIsDemoAccount();
  const release = useQuery({
    queryKey: ["windows-player-release"],
    queryFn: async () => {
      const response = await fetch("/api/public/player-windows?info=1");
      if (!response.ok) throw new Error("Installer unavailable");
      return response.json() as Promise<{ version: string; bytes: number }>;
    },
    enabled: !isDemo,
    staleTime: 60_000,
  });
  return <article className="w-full max-w-sm rounded-lg border border-border bg-surface/90 p-5 shadow-sm backdrop-blur">
    <div className="mb-4 flex items-center gap-3">
      <Monitor className="size-9 shrink-0 text-primary" />
      <div><h2 className="font-display text-xl font-bold">BM Player</h2><p className="text-sm text-muted-foreground">Windows 10 / 11 · 64-bit</p></div>
    </div>
    <p className="mb-4 text-sm text-muted-foreground">Live TV, films and series with playback inside BM Player.</p>
    {release.data && <p className="mb-3 text-xs text-muted-foreground">Version {release.data.version} · {Math.round(release.data.bytes / 1_000_000)} MB</p>}
    {isDemo ? <Button disabled size="sm"><Download className="size-4" />Demo — download unavailable</Button> : release.data ? <Button asChild size="sm"><a href="/api/public/player-windows" download><Download className="size-4" />Download for Windows</a></Button> : <Button disabled size="sm"><Download className="size-4" />{release.isError ? "Download unavailable" : "Loading download…"}</Button>}
    <div className="mt-4 rounded-md border border-border bg-background/80 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Your PC needs</p>
      <ul className="mt-1.5 space-y-1 text-xs text-foreground">
        <li>Windows 10 or Windows 11, 64-bit</li>
        <li>4 GB of memory — 8 GB if you use multi-screen</li>
        <li>About 400 MB of free space once installed</li>
        <li>Broadband: 15 Mbps for HD, 25 Mbps for 4K</li>
      </ul>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Unsigned installer. Windows may show a security warning — choose More info, then Run anyway.</p>
  </article>;
}