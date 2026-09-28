import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PDFPageProxy } from "pdfjs-dist";

const pdfWorkerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

function PdfPage({ page, width }: { page: PDFPageProxy; width: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / unscaled.width });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = Math.floor(viewport.width * pixelRatio);
    canvas.height = Math.floor(viewport.height * pixelRatio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    const task = page.render({
      canvasContext: context,
      viewport,
      transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
    });
    return () => task.cancel();
  }, [page, width]);

  return <canvas ref={canvasRef} className="block max-w-full bg-white shadow-md" />;
}

export function MobilePdfViewer({ url, title }: { url: string; title: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pages, setPages] = useState<PDFPageProxy[]>([]);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | null = null;
    void import("pdfjs-dist").then(async (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      loadingTask = pdfjs.getDocument({ url });
      try {
        const loaded = await loadingTask.promise;
        if (cancelled) return;
        const loadedPages = await Promise.all(
          Array.from({ length: loaded.numPages }, (_, index) => loaded.getPage(index + 1)),
        );
        if (!cancelled) setPages(loadedPages);
      } catch {
        if (!cancelled) setError(true);
      }
    });
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [url]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateWidth = () => setWidth(Math.max(1, container.clientWidth));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} aria-label={`${title} document`} className="h-full min-h-0 w-full overflow-y-auto rounded-lg bg-muted p-1">
      {error ? (
        <div className="grid min-h-48 place-items-center px-4 text-center text-sm text-muted-foreground">
          This guide could not be displayed. Please close it and try again.
        </div>
      ) : pages.length === 0 ? (
        <div className="grid min-h-48 place-items-center text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <div className="flex min-w-0 flex-col items-center gap-2">
          {pages.map((page, index) => <PdfPage key={index} page={page} width={width - 8} />)}
        </div>
      )}
    </div>
  );
}