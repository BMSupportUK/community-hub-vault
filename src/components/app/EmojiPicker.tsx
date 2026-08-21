import { useMemo, useState } from "react";
import { Smile, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
};

const RECENT_KEY = "chat-emoji-recent";

const GROUPS: { name: string; emojis: string[] }[] = [
  {
    name: "Smileys",
    emojis: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🥵","🥶","😵","🤯","🤠","🥳","😎","🤓","🧐","😕","😟","🙁","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","💀","🤡","👻","👽","🤖",
    ],
  },
  {
    name: "Gestures",
    emojis: [
      "👍","👎","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👋","🤚","🖐️","✋","🖖","👏","🙌","🤝","🙏","💪","🦾","✍️","💅","👀","👄","🧠","🫡","🫶","🤦","🤷","💁","🙋","🙇","🤙",
    ],
  },
  {
    name: "Hearts & Symbols",
    emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","🔥","✨","⭐","🌟","💫","💥","💯","✅","❌","⚠️","❓","❗","🔔","🔕","👑","🏆","🥇","🥈","🥉","🎉","🎊","🎁","🎈",
    ],
  },
  {
    name: "Football",
    emojis: [
      "⚽","🥅","🧤","👟","🏟️","🚩","🟥","🟨","📺","📡","🎯","🏅","🎖️","📢","🥊","🏃","🤾","🙌","😤","🔴","⚪",
    ],
  },
  {
    name: "Food & Drink",
    emojis: [
      "🍺","🍻","🥂","🍾","☕","🍵","🥤","🍕","🍔","🍟","🌭","🥪","🌮","🍿","🍩","🍪","🎂","🍰","🍫","🍭","🍎","🍌","🍇","🍉",
    ],
  },
  {
    name: "Objects & Travel",
    emojis: [
      "📱","💻","🖥️","⌨️","🖱️","🔌","🔋","📶","🛜","📡","💾","💿","🎮","🕹️","🎧","🎬","📷","🔍","🔒","🔑","🛠️","🧰","🚗","🚕","🚌","✈️","🚀","🚂","🏠","🌍","☀️","🌙","⛅","🌧️","⛈️","❄️","🌈",
    ],
  },
];

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === "string").slice(0, 24) : [];
  } catch {
    return [];
  }
}

/**
 * Emote picker for chat composers. Works alongside the OS emoji panel
 * (Windows: Win + . / Win + ;) which types straight into the textarea.
 */
export function EmojiPicker({ onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>(loadRecent);

  const filtered = useMemo(() => {
    const needle = q.trim();
    if (!needle) return null;
    const all = GROUPS.flatMap((g) => g.emojis);
    const names: Record<string, string[]> = {};
    // simple contains match on group name as a fallback keyword search
    const byGroup = GROUPS.filter((g) => g.name.toLowerCase().includes(needle.toLowerCase()));
    void names;
    return byGroup.length ? byGroup.flatMap((g) => g.emojis) : all.filter((e) => e.includes(needle));
  }, [q]);

  const pick = (emoji: string) => {
    onSelect(emoji);
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, 24);
    setRecent(next);
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title="Emotes (or press Win + . for the Windows emoji panel)"
          aria-label="Insert emote"
          className="size-8 rounded-lg bg-surface-2 border border-border text-muted-foreground hover:text-foreground hover:bg-surface-2/70 grid place-items-center disabled:opacity-50"
        >
          <Smile className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-[340px] max-w-[92vw] p-0 overflow-hidden">
        <div className="px-3 py-2 border-b border-border bg-muted/30">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search emotes (smileys, hearts, football…)"
              className="w-full bg-background border border-border rounded-md pl-7 pr-2 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Tip: press <kbd className="px-1 rounded bg-surface-2 border border-border">Win</kbd> +{" "}
            <kbd className="px-1 rounded bg-surface-2 border border-border">.</kbd> for the Windows emoji &amp; GIF tray —
            emotes type straight in, and pasted GIFs post automatically.
          </p>
        </div>
        <div className="h-72 overflow-y-auto p-2">
          {filtered ? (
            <Grid emojis={filtered} onPick={pick} />
          ) : (
            <>
              {recent.length > 0 && (
                <Section title="Frequently used">
                  <Grid emojis={recent} onPick={pick} />
                </Section>
              )}
              {GROUPS.map((g) => (
                <Section key={g.name} title={g.name}>
                  <Grid emojis={g.emojis} onPick={pick} />
                </Section>
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function Grid({ emojis, onPick }: { emojis: string[]; onPick: (e: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {emojis.map((e, i) => (
        <button
          key={`${e}-${i}`}
          type="button"
          onClick={() => onPick(e)}
          className="size-9 grid place-items-center rounded-md text-xl hover:bg-surface-2"
        >
          {e}
        </button>
      ))}
    </div>
  );
}
