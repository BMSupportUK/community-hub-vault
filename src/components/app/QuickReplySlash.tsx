import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuickReplies, type QuickReply, type QuickReplyScope } from "./QuickRepliesDialog";

/**
 * `/` command for the chat composer: type `/` then part of a shortcut code to
 * pick a saved staff reply. Choosing one asks for a quick confirmation before
 * the sentence is dropped into the message bar.
 */
export function useQuickReplySlash({
  value,
  onChange,
  editorRef,
  scope = "talk",
  onSend,
}: {
  value: string;
  onChange: (next: string) => void;
  editorRef: React.RefObject<HTMLTextAreaElement | HTMLDivElement | null>;
  scope?: QuickReplyScope;
  /** When set, confirming a shortcut sends it straight to chat instead of inserting it. */
  onSend?: (text: string) => void;
}) {
  const { replies, isStaff } = useQuickReplies(scope);
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [confirming, setConfirming] = useState<QuickReply | null>(null);
  const queryStart = useRef(-1);

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

  // Detect the "/..." token under the caret.
  useEffect(() => {
    if (!isStaff) return;
    const caret = caretOffset();
    const before = value.slice(0, caret);
    const m = /(?:^|\s)\/([a-zA-Z0-9_-]*)$/.exec(before);
    if (!m) {
      setQuery(null);
      setConfirming(null);
      queryStart.current = -1;
      return;
    }
    queryStart.current = caret - m[1].length - 1;
    setQuery(m[1]);
    setHighlight(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editorRef, isStaff]);

  const results = useMemo(() => {
    if (query === null) return [];
    const q = query.trim().toLowerCase();
    return replies
      .filter((r) => !q || r.code.toLowerCase().includes(q) || r.body.toLowerCase().includes(q))
      .slice(0, 8);
  }, [replies, query]);

  /** Swap the "/query" token for the shortcut sentence, or send it straight away. */
  const insertReply = (reply: QuickReply) => {
    if (queryStart.current < 0) return;
    const caret = caretOffset();
    const next = `${value.slice(0, queryStart.current)}${reply.body} ${value.slice(caret)}`.trim();
    if (onSend) {
      // Confirmed: send the shortcut straight to chat and clear the composer.
      onChange("");
      const clearEl = editorRef.current;
      if (clearEl && !(clearEl instanceof HTMLTextAreaElement)) clearEl.textContent = "";
      setQuery(null);
      setConfirming(null);
      queryStart.current = -1;
      onSend(next);
      return;
    }
    onChange(next);
    const el = editorRef.current;
    if (el && !(el instanceof HTMLTextAreaElement)) el.textContent = next;
    setQuery(null);
    setConfirming(null);
    queryStart.current = -1;
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      if (!(editor instanceof HTMLTextAreaElement)) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    });
  };

  const isOpen = isStaff && query !== null && (results.length > 0 || confirming !== null);

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (!isOpen) return false;
    if (confirming) {
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertReply(confirming);
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setConfirming(null);
        return true;
      }
      return false;
    }
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
      if (pick) setConfirming(pick);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setQuery(null);
      return true;
    }
    return false;
  };

  const dropdown = useMemo(() => {
    if (!isOpen) return null;
    return (
      <div className="absolute bottom-full left-0 mb-2 w-80 max-w-[90vw] rounded-lg border border-border bg-popover text-popover-foreground shadow-xl overflow-hidden z-50">
        <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40">
          <Keyboard className="size-3.5 text-amber-400" />
          {confirming ? (onSend ? "Send this shortcut now?" : "Use this shortcut?") : `Shortcuts /${query || "…"}`}
        </div>

        {confirming ? (
          <div className="p-3 space-y-2">
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-300">
              /{confirming.code}
            </span>
            <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-foreground/90">
              {confirming.body}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setConfirming(null);
                }}
                className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertReply(confirming);
                }}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
              >
                Use shortcut
              </button>
            </div>
          </div>
        ) : (
          <ul className="max-h-72 overflow-y-auto">
            {results.map((r, i) => (
              <li key={r.id}>
                <button
                  type="button"
                  title="Use this shortcut"
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setConfirming(r);
                  }}
                  className={cn(
                    "w-full px-3 py-2 text-left",
                    i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                  )}
                >
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-300">
                    /{r.code}
                  </span>
                  <p className="mt-1 line-clamp-2 text-xs text-foreground/90">{r.body}</p>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border bg-muted/40">
          {confirming
            ? "Enter to insert · Esc to go back"
            : "↑↓ navigate · Enter or Tab to choose · Esc close"}
        </div>
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, query, results, highlight, confirming]);

  return { dropdown, onKeyDown, isOpen };
}
