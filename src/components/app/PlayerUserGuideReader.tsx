import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RotateCw } from "lucide-react";
import { openPlayerUserGuide } from "@/lib/player-user-guides.functions";
import { MobilePdfViewer } from "@/components/app/MobilePdfViewer";
import { Button } from "@/components/ui/button";

export function PlayerUserGuideReader({ articleId, title }: { articleId: string; title: string }) {
  const open = useServerFn(openPlayerUserGuide);
  const [data, setData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setData(null); setError(false);
    void open({ data: { articleId } }).then((result) => {
      if (!cancelled) setData(Uint8Array.from(atob(result.pdf), (c) => c.charCodeAt(0)));
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [articleId, attempt, open]);
  return <section aria-label="Protected PDF guide" className="h-[75dvh] min-h-80 w-full min-w-0" onContextMenu={(e) => e.preventDefault()}>
    {error ? <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground"><p>This guide could not be opened.</p><Button variant="outline" onClick={() => setAttempt((n) => n + 1)}><RotateCw /> Try again</Button></div>
      : data ? <MobilePdfViewer data={data} title={title} paginated />
      : <div className="grid h-full place-items-center text-muted-foreground"><Loader2 className="size-6 animate-spin" aria-label="Opening guide" /></div>}
  </section>;
}