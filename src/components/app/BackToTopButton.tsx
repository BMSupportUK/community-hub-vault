import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowUp } from "lucide-react";

/**
 * Floating "back to top" arrow that appears once the PAGE is scrolled down.
 *
 * Pages scroll in different containers (some in the window, some in a
 * full-size page wrapper), so we listen in the capture phase — but only
 * page-level scrollers count. Inner widgets (chat lists, reply panes,
 * side rails, dialogs) also emit scroll events and must not pop the
 * button up when the page itself hasn't moved.
 */
function isPageScroller(target: EventTarget | null): boolean {
  if (
    target === window ||
    target === document ||
    target === document.documentElement ||
    target === document.scrollingElement
  ) {
    return true;
  }
  if (!(target instanceof HTMLElement)) return false;
  // Dialogs and portals manage their own scroll — never trigger the button.
  if (target.closest('[role="dialog"], [data-radix-portal]')) return false;
  // A page-level scroller fills (nearly) the full width and most of the
  // viewport height. Inner widgets (chat lists ~70vh panels, reply panes,
  // side rails) are smaller and are filtered out here.
  const rect = target.getBoundingClientRect();
  return (
    rect.width >= window.innerWidth * 0.9 &&
    rect.height >= window.innerHeight * 0.75
  );
}

export function BackToTopButton() {
  const [visible, setVisible] = useState(false);
  const lastScroller = useRef<HTMLElement | Window | null>(null);
  const router = useRouter();

  useEffect(() => {
    const evaluate = () => {
      const s = lastScroller.current;
      const top = s
        ? s instanceof Window
          ? s.scrollY
          : s.scrollTop
        : window.scrollY;
      setVisible(top > 600);
    };

    // Scroll events don't bubble, so listen in the capture phase to catch
    // scrolls on inner containers as well as the window — then filter.
    const onScroll = (e: Event) => {
      const target = e.target;
      const scroller: HTMLElement | Window =
        target instanceof HTMLElement ? target : window;
      if (!isPageScroller(target)) return;
      lastScroller.current = scroller;
      evaluate();
    };

    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  // Navigating to a new page starts it fresh: hide the button until the new
  // page is actually scrolled, and re-check any restored scroll position.
  useEffect(() => {
    lastScroller.current = null;
    setVisible(window.scrollY > 600);
  }, [router.location.pathname]);

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
