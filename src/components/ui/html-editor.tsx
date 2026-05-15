import { useEffect, useRef } from "react";
import { Bold, Italic, Underline, Heading1, Heading2, List, ListOrdered, Link2, Quote, Code, Undo2, Redo2, Eraser } from "lucide-react";

type Props = {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
};

function exec(cmd: string, arg?: string) {
  document.execCommand(cmd, false, arg);
}

export function HtmlEditor({ value, onChange, className, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Initialize / sync external value when it changes from outside (e.g. switching record)
  useEffect(() => {
    if (!ref.current) return;
    if (ref.current.innerHTML !== (value ?? "")) {
      ref.current.innerHTML = value ?? "";
    }
  }, [value]);

  const handleInput = () => {
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const Btn = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className="p-1.5 rounded hover:bg-accent text-foreground/80 hover:text-foreground"
    >
      {children}
    </button>
  );

  const promptLink = () => {
    const url = window.prompt("Link URL");
    if (!url) return;
    exec("createLink", url);
    handleInput();
  };

  return (
    <div className={`rounded-md border border-border bg-background ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border p-1">
        <Btn title="Bold" onClick={() => { exec("bold"); handleInput(); }}><Bold className="size-4" /></Btn>
        <Btn title="Italic" onClick={() => { exec("italic"); handleInput(); }}><Italic className="size-4" /></Btn>
        <Btn title="Underline" onClick={() => { exec("underline"); handleInput(); }}><Underline className="size-4" /></Btn>
        <span className="mx-1 h-5 w-px bg-border" />
        <Btn title="Heading 1" onClick={() => { exec("formatBlock", "<h1>"); handleInput(); }}><Heading1 className="size-4" /></Btn>
        <Btn title="Heading 2" onClick={() => { exec("formatBlock", "<h2>"); handleInput(); }}><Heading2 className="size-4" /></Btn>
        <Btn title="Quote" onClick={() => { exec("formatBlock", "<blockquote>"); handleInput(); }}><Quote className="size-4" /></Btn>
        <Btn title="Code" onClick={() => { exec("formatBlock", "<pre>"); handleInput(); }}><Code className="size-4" /></Btn>
        <span className="mx-1 h-5 w-px bg-border" />
        <Btn title="Bullet list" onClick={() => { exec("insertUnorderedList"); handleInput(); }}><List className="size-4" /></Btn>
        <Btn title="Numbered list" onClick={() => { exec("insertOrderedList"); handleInput(); }}><ListOrdered className="size-4" /></Btn>
        <Btn title="Link" onClick={promptLink}><Link2 className="size-4" /></Btn>
        <span className="mx-1 h-5 w-px bg-border" />
        <Btn title="Clear formatting" onClick={() => { exec("removeFormat"); handleInput(); }}><Eraser className="size-4" /></Btn>
        <Btn title="Undo" onClick={() => { exec("undo"); handleInput(); }}><Undo2 className="size-4" /></Btn>
        <Btn title="Redo" onClick={() => { exec("redo"); handleInput(); }}><Redo2 className="size-4" /></Btn>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        className="prose prose-sm dark:prose-invert max-w-none min-h-[180px] px-3 py-2 focus:outline-none [&[data-placeholder]:empty::before]:content-[attr(data-placeholder)] [&[data-placeholder]:empty::before]:text-muted-foreground"
      />
    </div>
  );
}