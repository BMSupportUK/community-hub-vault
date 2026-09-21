import * as React from "react";

/**
 * A page may only be locked to the viewport when the screen is genuinely
 * large: wide enough for side-by-side panels and tall enough that a locked
 * panel does not clip its own content. Anything smaller scrolls normally.
 */
export const VIEWPORT_LOCK_QUERY = "(min-width: 1024px) and (min-height: 700px)";

export function useViewportLockable() {
  const [lockable, setLockable] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia(VIEWPORT_LOCK_QUERY);
    const onChange = () => setLockable(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return lockable;
}
