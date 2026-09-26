import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Floating "back to top" arrow that appears once the page is scrolled down.
 * Pages scroll in different containers (some in .boro-theme, some in window),
 * so we track whichever element last fired a scroll event.
 */
export function BackToTopButton() {
  const [visible, setVisible] = useState(false);
  const lastScroller = useRef<HTMLElement | Window | null>(null);

  useEffect(() => {
    // Scroll events don't bubble, so listen in the capture phase to catch
    // scrolls on inner containers as well as the window.
    const onScroll = (e: Event) => {
      const target = e.target;
      const scroller: HTMLElement | Window =
        target instanceof HTMLElement ? target : window;
      lastScroller.current = scroller;
      const top = scroller instanceof Window ? scroller.scrollY : scroller.scrollTop;
      setVisible(top > 600);
    };
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => {
        const s = lastScroller.current;
        if (s && !(s instanceof Window)) s.scrollTo({ top: 0, behavior: "smooth" });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
      className="fixed bottom-5 right-5 z-50 grid h-12 w-12 place-items-center rounded-full border border-fuchsia-400/60 bg-purple-950/90 text-fuchsia-100 shadow-lg shadow-fuchsia-500/30 backdrop-blur transition hover:bg-purple-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}

export default BackToTopButton;
