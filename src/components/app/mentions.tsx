import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { censorText, useProfanityWords } from "@/lib/profanity";

const MENTION_RE = /(@[a-zA-Z0-9_.\-]+)/g;

/**
 * Returns true if the message content mentions the current user
 * (by username, or via the @all / @here broadcasts).
 */
export function mentionsCurrentUser(content: string, currentUsername?: string | null): boolean {
  const me = currentUsername?.toLowerCase() ?? null;
  const matches = content.match(MENTION_RE);
  if (!matches) return false;
  for (const raw of matches) {
    const tag = raw.slice(1).toLowerCase();
    if (tag === "all" || tag === "here") return true;
    if (me && tag === me) return true;
  }
  return false;
}

/**
 * Render message text with @username / @all / @here highlighted Discord-style.
 * `currentUsername` (lowercase) makes mentions of self glow stronger.
 */
export function MentionText({
  content,
  currentUsername,
  className,
}: {
  content: string;
  currentUsername?: string | null;
  className?: string;
}) {
  // Subscribe so updates to the custom word list re-render messages.
  useProfanityWords();
  const me = currentUsername?.toLowerCase() ?? null;
  const parts = content.split(MENTION_RE);
  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {parts.map((part, i) => {
        if (!part.startsWith("@")) return <span key={i}>{censorText(part)}</span>;
        const tag = part.slice(1).toLowerCase();
        const isBroadcast = tag === "all" || tag === "here";
        const isMe = !!me && tag === me;
        return (
          <span
            key={i}
            className={cn(
              "inline-block rounded px-1.5 py-0.5 font-semibold transition-colors ring-1",
              isMe
                ? "bg-amber-300 text-amber-950 ring-amber-500"
                : isBroadcast
                  ? "bg-rose-600 text-white ring-rose-700"
                  : "bg-indigo-600 text-white ring-indigo-700 hover:bg-indigo-500",
            )}
          >
            {part}
          </span>
        );
      })}
    </span>
  );
}

export interface MentionUser {
  id: string;
  username: string;
  display_name: string | null;
}

/**
 * Hook that powers an @-autocomplete dropdown for a textarea.
 * - Tracks the current "@query" the caret is sitting in.
 * - Searches the profiles table (and optionally adds @all / @here for admins).
 * - Returns helpers + a ready-to-render dropdown component.
 */
export function useMentionAutocomplete({
  value,
  onChange,
  textareaRef,
  canBroadcast,
}: {
  value: string;
  onChange: (next: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  canBroadcast: boolean;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const [results, setResults] = useState<MentionUser[]>([]);
  const [highlight, setHighlight] = useState(0);
  const queryStart = useRef<number>(-1);

  // Detect "@..." token under the caret on every value change.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const m = /(?:^|\s)@([a-zA-Z0-9_.\-]*)$/.exec(before);
    if (!m) {
      setQuery(null);
      queryStart.current = -1;
      return;
    }
    queryStart.current = caret - m[1].length - 1; // index of "@"
    setQuery(m[1]);
    setHighlight(0);
  }, [value, textareaRef]);

  // Look up matches.
  useEffect(() => {
    if (query === null) {
      setResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const q = query.trim();
      const builder = supabase
        .from("profiles")
        .select("id, username, display_name")
        .not("username", "is", null)
        .order("username", { ascending: true })
        .limit(8);
      const { data } = q
        ? await builder.ilike("username", `${q}%`)
        : await builder;
      if (cancelled) return;
      const users = ((data ?? []) as MentionUser[]).filter((u) => !!u.username);
      const broadcast: MentionUser[] = canBroadcast
        ? (
            [
              { id: "__all", username: "all", display_name: "Notify everyone" },
              { id: "__here", username: "here", display_name: "Notify members in this room" },
            ] as MentionUser[]
          ).filter((b) => !q || b.username.startsWith(q.toLowerCase()))
        : [];
      // Role mentions — anyone can tag a role to notify everyone with that role
      const ROLES: Array<{ name: string; label: string }> = [
        { name: "admin", label: "Notify all admins" },
        { name: "management", label: "Notify all management" },
        { name: "moderator", label: "Notify all moderators" },
        { name: "staff", label: "Notify all staff" },
        { name: "member", label: "Notify all members" },
      ];
      const roles: MentionUser[] = ROLES
        .filter((r) => !q || r.name.startsWith(q.toLowerCase()))
        .map((r) => ({ id: `__role_${r.name}`, username: r.name, display_name: r.label }));
      setResults([...broadcast, ...roles, ...users]);
    })();
    return () => {
      cancelled = true;
    };
  }, [query, canBroadcast]);

  const apply = (user: MentionUser) => {
    const ta = textareaRef.current;
    if (!ta || queryStart.current < 0) return;
    const caret = ta.selectionStart ?? value.length;
    const before = value.slice(0, queryStart.current);
    const after = value.slice(caret);
    const insert = `@${user.username} `;
    const next = before + insert + after;
    onChange(next);
    const pos = before.length + insert.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
    setQuery(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
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
      if (pick) apply(pick);
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
      <div className="absolute bottom-full left-0 mb-2 w-72 max-w-[90vw] rounded-lg border border-border bg-popover text-popover-foreground shadow-xl overflow-hidden z-50">
        <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40">
          People matching @{query || "…"}
        </div>
        <ul className="max-h-60 overflow-y-auto">
          {results.map((u, i) => (
            <li key={u.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  apply(u);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-left text-sm",
                  i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                <span
                  className={cn(
                    "inline-block rounded px-1.5 py-0.5 text-xs font-semibold",
                    u.id.startsWith("__")
                      ? "bg-rose-500/20 text-rose-300"
                      : "bg-indigo-500/20 text-indigo-300",
                  )}
                >
                  @{u.username}
                </span>
                {u.display_name && (
                  <span className="text-xs text-muted-foreground truncate">{u.display_name}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border bg-muted/40">
          ↑↓ to navigate · Enter or Tab to insert · Esc to close
        </div>
      </div>
    );
  }, [query, results, highlight]);

  return { dropdown, onKeyDown, isOpen: query !== null && results.length > 0 };
}