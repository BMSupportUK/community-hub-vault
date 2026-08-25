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
  Underline,
} from "lucide-react";
import type { RefObject } from "react";

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

/** Formatting toolbar for the talk-channel message composer. */
export function ChatFormatToolbar({ editorRef, onAfterCommand, disabled }: Props) {
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
    <div className="mb-1 flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-surface-2/60 px-1.5 py-1">
      {BUTTONS.map(({ cmd, icon: Icon, label }) => (
        <button
          key={cmd}
          type="button"
          title={label}
          aria-label={label}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run(cmd)}
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
