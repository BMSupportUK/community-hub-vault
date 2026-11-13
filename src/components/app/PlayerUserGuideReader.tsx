import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RotateCw } from "lucide-react";
import { openPlayerUserGuide } from "@/lib/player-user-guides.functions";
import { MobilePdfViewer } from "@/components/app/MobilePdfViewer";
import { Button } from "@/components/ui/button";

export function PlayerUserGuideReader({ articleId, title }: { articleId: string; title: string }) {
  const open = useServerFn(openPlayerUserGuide);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null); setError(false);
    void open({ data: { articleId } }).then((result) => {
      if (cancelled) return;
      const bytes = Uint8Array.from(atob(result.pdf), (c) => c.charCodeAt(0));
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setUrl(objectUrl);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [articleId, attempt, open]);
  return <section aria-label="Protected PDF guide" className="flex min-h-0 flex-1 w-full min-w-0 flex-col" onContextMenu={(e) => e.preventDefault()}>
    {error ? <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground"><p>This guide could not be opened.</p><Button variant="outline" onClick={() => setAttempt((n) => n + 1)}><RotateCw /> Try again</Button></div>
      : url ? <><div className="min-h-0 flex-1 md:hidden"><MobilePdfViewer url={url} title={title} /></div><iframe src={`${url}#toolbar=0&navpanes=0`} title={title} className="hidden min-h-0 flex-1 w-full rounded-lg border border-border bg-card md:block" /></>
      : <div className="grid h-full place-items-center text-muted-foreground"><Loader2 className="size-6 animate-spin" aria-label="Opening guide" /></div>}
  </section>;
}