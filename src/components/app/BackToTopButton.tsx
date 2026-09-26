import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/** Floating "back to top" arrow that appears once the page is scrolled down. */
export function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const findScroller = (): HTMLElement | Window => {
      const el = document.querySelector<HTMLElement>(".boro-theme.overflow-y-auto");
      return el ?? window;
    };

    const getScrollTop = () => {
      const s = findScroller();
      return s instanceof Window ? s.scrollY : s.scrollTop;
    };

    // Scroll events don't bubble, so listen in the capture phase to catch
    // scrolls on inner containers (the app scrolls inside .boro-theme, not window).
    const onScroll = () => setVisible(getScrollTop() > 600);
    onScroll();
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => {
        const el = document.querySelector<HTMLElement>(".boro-theme.overflow-y-auto");
        if (el) el.scrollTo({ top: 0, behavior: "smooth" });
        else window.scrollTo({ top: 0, behavior: "smooth" });
      }}
      className="fixed bottom-5 right-5 z-50 grid h-12 w-12 place-items-center rounded-full border border-fuchsia-400/60 bg-purple-950/90 text-fuchsia-100 shadow-lg shadow-fuchsia-500/30 backdrop-blur transition hover:bg-purple-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}

export default BackToTopButton;
