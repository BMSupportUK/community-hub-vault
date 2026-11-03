import { Apple, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useIsDemoAccount } from "@/hooks/use-demo-account";

export function MacPlayerDownload() {
  const isDemo = useIsDemoAccount();
  const release = useQuery({
    queryKey: ["mac-player-release"],
    queryFn: async () => {
      const response = await fetch("/api/public/player-mac?info=1");
      if (!response.ok) throw new Error("Download unavailable");
      return response.json() as Promise<{ version: string; bytes: number }>;
    },
    enabled: !isDemo,
    staleTime: 60_000,
  });
  return <article className="w-full max-w-sm rounded-lg border border-border bg-surface/90 p-5 shadow-sm backdrop-blur">
    <div className="mb-4 flex items-center gap-3">
      <Apple className="size-9 shrink-0 text-primary" />
      <div><h2 className="font-display text-xl font-bold">BM Player</h2><p className="text-sm text-muted-foreground">macOS 12 or newer · Apple Silicon &amp; Intel</p></div>
    </div>
    <p className="mb-4 text-sm text-muted-foreground">Live TV, films and series with playback inside BM Player.</p>
    {release.data && <p className="mb-3 text-xs text-muted-foreground">Version {release.data.version} · {Math.round(release.data.bytes / 1_000_000)} MB</p>}
    {isDemo ? <Button disabled size="sm"><Download className="size-4" />Demo — download unavailable</Button> : release.data ? <Button asChild size="sm"><a href="/api/public/player-mac" download><Download className="size-4" />Download for Mac</a></Button> : <Button disabled size="sm"><Download className="size-4" />{release.isError ? "Download unavailable" : "Loading download…"}</Button>}
    <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
      <li>Open the downloaded zip.</li>
      <li>Drag BM Player into Applications.</li>
      <li>First time only: right-click BM Player and choose Open, then Open again.</li>
    </ol>
  </article>;
}
