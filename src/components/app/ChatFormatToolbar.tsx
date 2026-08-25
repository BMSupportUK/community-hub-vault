import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  Italic,
  List,
  ListOrdered,
  Strikethrough,
  Type,
  Underline,
} from "lucide-react";
import { useState, type RefObject } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  /** The contentEditable composer element. */
  editorRef: RefObject<HTMLDivElement | null>;
  /** Called after a command runs so the parent can sync its draft state. */
  onAfterCommand: () => void;
  disabled?: boolean;
};

const BUTTONS: Array<{ cmd: string; icon: typeof Bold; label: string }> = [
  { cmd: "bold", icon: Bold, label: "Bold" },
  { cmd: "italic", icon: Italic, label: "Italic" },
  { cmd: "underline", icon: Underline, label: "Underline" },
  { cmd: "strikeThrough", icon: Strikethrough, label: "Strikethrough" },
  { cmd: "insertUnorderedList", icon: List, label: "Bullet list" },
  { cmd: "insertOrderedList", icon: ListOrdered, label: "Numbered list" },
  { cmd: "justifyLeft", icon: AlignLeft, label: "Align left" },
  { cmd: "justifyCenter", icon: AlignCenter, label: "Align centre" },
  { cmd: "justifyRight", icon: AlignRight, label: "Align right" },
  { cmd: "removeFormat", icon: Eraser, label: "Clear formatting" },
];

/** Formatting popover for the talk-channel message composer. */
export function ChatFormatToolbar({ editorRef, onAfterCommand, disabled }: Props) {
  const [open, setOpen] = useState(false);

  const run = (cmd: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (sel && (!sel.rangeCount || !editor.contains(sel.anchorNode))) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand(cmd, false);
    onAfterCommand();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Formatting"
          aria-label="Formatting"
          disabled={disabled}
          className="size-8 rounded-lg bg-surface-2 border border-border text-muted-foreground hover:text-foreground hover:bg-surface-2/70 grid place-items-center disabled:opacity-50"
        >
          <Type className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-auto p-1.5">
        <div className="grid grid-cols-5 gap-0.5">
          {BUTTONS.map(({ cmd, icon: Icon, label }) => (
            <button
              key={cmd}
              type="button"
              title={label}
              aria-label={label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run(cmd)}
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
