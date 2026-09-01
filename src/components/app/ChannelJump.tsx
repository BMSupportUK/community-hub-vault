import { useEffect, useMemo, useRef, useState } from "react";
import { Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export interface JumpChannel {
  id: string;
  slug: string;
  name: string;
  group_label: string | null;
  staff_only: boolean;
}

/**
 * `#` command for the chat composer: type `#` then part of a channel name to
 * jump straight to another Talk channel. Mirrors the @-mention dropdown UX.
 */
export function useChannelJump({
  value,
  onChange,
  editorRef,
}: {
  value: string;
  onChange: (next: string) => void;
  editorRef: React.RefObject<HTMLTextAreaElement | HTMLDivElement | null>;
}) {
  const navigate = useNavigate();
  const [channels, setChannels] = useState<JumpChannel[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const queryStart = useRef(-1);

  // Channel list the current user is allowed to see (RLS filtered).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("chat_channels")
        .select("id, slug, name, group_label, staff_only")
        .order("sort_order");
      if (!cancelled) setChannels((data as JumpChannel[] | null) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const caretOffset = () => {
    const el = editorRef.current;
    if (!el) return value.length;
    if (el instanceof HTMLTextAreaElement) return el.selectionStart ?? value.length;
    const selection = window.getSelection();
    if (!selection?.rangeCount || !el.contains(selection.anchorNode)) return value.length;
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(el);
    range.setEnd(selection.anchorNode ?? el, selection.anchorOffset);
    return range.toString().length;
  };

  // Detect the "#..." token under the caret.
  useEffect(() => {
    const caret = caretOffset();
    const before = value.slice(0, caret);
    const m = /(?:^|\s)#([a-zA-Z0-9_\-]*)$/.exec(before);
    if (!m) {
      setQuery(null);
      queryStart.current = -1;
      return;
    }
    queryStart.current = caret - m[1].length - 1;
    setQuery(m[1]);
    setHighlight(0);
  }, [value, editorRef]);

  const results = useMemo(() => {
    if (query === null) return [];
    const q = query.trim().toLowerCase();
    return channels
      .filter((c) => !q || c.slug.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [channels, query]);

  /** Replace the "#query" token with `replacement` (empty string removes it). */
  const replaceToken = (replacement: string) => {
    if (queryStart.current < 0) return;
    const caret = caretOffset();
    const next = value.slice(0, queryStart.current) + replacement + value.slice(caret);
    onChange(next);
    const el = editorRef.current;
    if (el && !(el instanceof HTMLTextAreaElement)) el.textContent = next;
  };

  const apply = (ch: JumpChannel) => {
    // Strip the "#query" token from the draft, then jump to the channel.
    replaceToken("");
    setQuery(null);
    void navigate({ to: "/home/$channel", params: { channel: ch.slug } });
  };

  /** Drop a shareable channel link into the draft instead of navigating away. */
  const insertLink = (ch: JumpChannel) => {
    replaceToken(`[#${ch.slug}](/home/${ch.slug}) `);
    setQuery(null);
    requestAnimationFrame(() => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      if (!(el instanceof HTMLTextAreaElement)) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (query === null || results.length === 0) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const pick = results[highlight];
      if (pick) {
        // Shift+Enter / Shift+Tab shares a link to the channel instead of jumping.
        if (e.shiftKey) insertLink(pick);
        else apply(pick);
      }
      return true;
    }
    if (e.key === "Escape") {
      setQuery(null);
      return true;
    }
    return false;
  };


  const dropdown = useMemo(() => {
    if (query === null || results.length === 0) return null;
    return (
      <div className="absolute bottom-full left-0 mb-2 w-80 max-w-[90vw] rounded-lg border border-border bg-popover text-popover-foreground shadow-xl overflow-hidden z-50">
        <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40">
          Jump to or share channel #{query || "…"}
        </div>
        <ul className="max-h-60 overflow-y-auto">
          {results.map((c, i) => (
            <li
              key={c.id}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "flex items-center gap-1 pr-2",
                i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
              )}
            >
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  apply(c);
                }}
                className="min-w-0 flex-1 flex items-center gap-2 px-3 py-2 text-left text-sm"
              >
                <Hash className="size-3.5 shrink-0 text-sky-400" />
                <span className="font-semibold truncate">{c.name}</span>
                {c.staff_only && (
                  <span className="rounded bg-amber-500/20 px-1 text-[9px] uppercase text-amber-400">
                    staff
                  </span>
                )}
                {c.group_label && (
                  <span className="ml-auto text-[10px] text-muted-foreground truncate">
                    {c.group_label}
                  </span>
                )}
              </button>
              <button
                type="button"
                title="Insert a link to this channel in your message"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertLink(c);
                }}
                className="shrink-0 inline-flex items-center gap-1 rounded-full border border-sky-500/50 bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-300 hover:bg-sky-500/30"
              >
                <Link2 className="size-3" />
                Share
              </button>
            </li>
          ))}
        </ul>
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border bg-muted/40">
          ↑↓ navigate · Enter jump · Shift+Enter share link · Esc close
        </div>
      </div>

    );
  }, [query, results, highlight]);

  return { dropdown, onKeyDown, isOpen: query !== null && results.length > 0 };
}
