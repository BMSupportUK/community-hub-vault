import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

/**
 * Renders `items` into a grid that is sliced into pages so each page fits
 * within `availableHeight`. Measures item layout in an off-screen clone of
 * the same grid container (matching width + className) so multi-column
 * breakpoints behave correctly.
 */
export function PagedGrid<T>({
  items,
  renderItem,
  className,
  availableHeight,
  page,
  onPagesChange,
  emptyState,
  maxRows,
}: {
  items: T[];
  renderItem: (item: T, i: number) => ReactNode;
  className: string;
  availableHeight: number;
  page: number;
  onPagesChange: (count: number) => void;
  emptyState?: ReactNode;
  /** If set, cap each page to this many grid rows (in addition to height fit). */
  maxRows?: number;
}) {
  const visibleRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pages, setPages] = useState<number[][]>([]);

  // Track visible container width so the measurement clone lays out identically.
  useLayoutEffect(() => {
    const el = visibleRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Recompute page slices when items / available height / measured width change.
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    if (!items.length || availableHeight <= 0 || width <= 0) {
      setPages(items.length ? [items.map((_, i) => i)] : []);
      return;
    }
    let raf = 0;
    const compute = () => {
      const kids = Array.from(el.children) as HTMLElement[];
      if (!kids.length) return;
      const out: number[][] = [];
      let cur: number[] = [];
      let top = 0;
      let rowsOnPage = 0;
      let lastRowTop = -1;
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        const kTop = k.offsetTop;
        const kBottom = kTop + k.offsetHeight;
        if (cur.length === 0) {
          top = kTop;
          cur.push(i);
          rowsOnPage = 1;
          lastRowTop = kTop;
          continue;
        }
        const isNewRow = kTop > lastRowTop + 1;
        const wouldExceedRows =
          isNewRow && maxRows != null && rowsOnPage + 1 > maxRows;
        if (kBottom - top > availableHeight || wouldExceedRows) {
          out.push(cur);
          cur = [i];
          top = kTop;
          rowsOnPage = 1;
          lastRowTop = kTop;
        } else {
          cur.push(i);
          if (isNewRow) {
            rowsOnPage += 1;
            lastRowTop = kTop;
          }
        }
      }
      if (cur.length) out.push(cur);
      setPages(out);
    };
    raf = requestAnimationFrame(compute);
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [items, availableHeight, width, maxRows]);

  useEffect(() => {
    onPagesChange(Math.max(pages.length, 1));
  }, [pages.length, onPagesChange]);

  const safePage = pages.length ? Math.min(Math.max(page, 0), pages.length - 1) : 0;
  const rawSlice = pages[safePage] ?? items.map((_, i) => i);
  // Guard against stale page indices after `items` shrinks (e.g. category switch).
  const slice = rawSlice.filter((i) => i < items.length);

  if (!items.length && emptyState) return <>{emptyState}</>;

  return (
    <>
      <div ref={visibleRef} className={className}>
        {slice.map((i) => renderItem(items[i], i))}
      </div>
      <div
        ref={measureRef}
        className={className}
        aria-hidden
        style={{
          position: "fixed",
          left: -99999,
          top: 0,
          width: width || "auto",
          visibility: "hidden",
          pointerEvents: "none",
        }}
      >
        {items.map((it, i) => renderItem(it, i))}
      </div>
    </>
  );
}

/** Numbered pagination bar (1 2 3 … N with prev/next). */
export function PaginationBar({
  page,
  pageCount,
  onPageChange,
  className,
}: {
  page: number;
  pageCount: number;
  onPageChange: (p: number) => void;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const nums = pageNumbers(page, pageCount);
  return (
    <Pagination className={className}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            onClick={(e) => {
              e.preventDefault();
              if (page > 0) onPageChange(page - 1);
            }}
            className={page <= 0 ? "pointer-events-none opacity-40" : "cursor-pointer"}
          />
        </PaginationItem>
        {nums.map((n, i) =>
          n === "…" ? (
            <PaginationItem key={`e-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={n}>
              <PaginationLink
                isActive={n - 1 === page}
                onClick={(e) => {
                  e.preventDefault();
                  onPageChange(n - 1);
                }}
                className="cursor-pointer"
              >
                {n}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            onClick={(e) => {
              e.preventDefault();
              if (page < pageCount - 1) onPageChange(page + 1);
            }}
            className={
              page >= pageCount - 1 ? "pointer-events-none opacity-40" : "cursor-pointer"
            }
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function pageNumbers(page: number, count: number): (number | "…")[] {
  const cur = page + 1;
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, cur - 1);
  const end = Math.min(count - 1, cur + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < count - 1) out.push("…");
  out.push(count);
  return out;
}

/** Returns `window.innerHeight - rect.top - bottomGap` for the given ref. */
export function useViewportFit(
  ref: React.RefObject<HTMLElement | null>,
  bottomGap = 80,
) {
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const node = ref.current;
      if (!node) return;
      const top = node.getBoundingClientRect().top;
      setH(Math.max(240, Math.floor(window.innerHeight - top - bottomGap)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    ro.observe(document.documentElement);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [ref, bottomGap]);
  return h;
}