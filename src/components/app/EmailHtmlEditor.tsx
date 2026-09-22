import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Code2, Eye, Type, Bold, Italic, Link2, Heading1, MousePointerClick, Minus, Image } from "lucide-react";

const STARTER_HTML = `<div style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,sans-serif">
  <h1 style="font-size:22px;color:#111;margin:0 0 12px">Heading</h1>
  <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 16px">Your message goes here.</p>
  <a href="https://bmsupport.uk" style="display:inline-block;background:#e11d48;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Open BM Support</a>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
  <p style="font-size:12px;color:#999;margin:0">BM Support</p>
</div>`;

const looksLikeHtml = (body: string) =>
  /<\s*(html|body|div|table|p|a|h1|h2|h3|span|img|br|td|tr|center|section)\b|<!doctype/i.test(body);

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholders?: string[] | null;
}

/** Email body editor: plain wording, or a built-in HTML editor with live preview. */
export function EmailHtmlEditor({ value, onChange, placeholders }: Props) {
  const [html, setHtml] = useState(() => looksLikeHtml(value));
  const [view, setView] = useState<"code" | "preview">("code");
  const ref = useRef<HTMLTextAreaElement>(null);

  const previewDoc = useMemo(
    () =>
      /<\s*html/i.test(value)
        ? value
        : `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,sans-serif">${value}</body></html>`,
    [value],
  );

  const wrap = (before: string, after = "") => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + before.length + selected.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="mt-1">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={html ? "outline" : "default"}
          onClick={() => setHtml(false)}
        >
          <Type className="mr-2 size-4" /> Wording
        </Button>
        <Button
          type="button"
          size="sm"
          variant={html ? "default" : "outline"}
          onClick={() => {
            setHtml(true);
            if (!value.trim()) onChange(STARTER_HTML);
          }}
        >
          <Code2 className="mr-2 size-4" /> HTML editor
        </Button>
        {html ? (
          <>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button
              type="button"
              size="sm"
              variant={view === "code" ? "secondary" : "ghost"}
              onClick={() => setView("code")}
            >
              <Code2 className="mr-2 size-4" /> Code
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "preview" ? "secondary" : "ghost"}
              onClick={() => setView("preview")}
            >
              <Eye className="mr-2 size-4" /> Preview
            </Button>
          </>
        ) : null}
      </div>

      {html && view === "code" ? (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <Button type="button" size="icon" variant="ghost" title="Bold" onClick={() => wrap("<strong>", "</strong>")}>
            <Bold className="size-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" title="Italic" onClick={() => wrap("<em>", "</em>")}>
            <Italic className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="Heading"
            onClick={() => wrap('<h1 style="font-size:22px;color:#111;margin:0 0 12px">', "</h1>")}
          >
            <Heading1 className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="Link"
            onClick={() => wrap('<a href="https://bmsupport.uk" style="color:#e11d48">', "</a>")}
          >
            <Link2 className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="Button"
            onClick={() =>
              wrap(
                '<a href="https://bmsupport.uk" style="display:inline-block;background:#e11d48;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">',
                "</a>",
              )
            }
          >
            <MousePointerClick className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="Divider"
            onClick={() => wrap('<hr style="border:none;border-top:1px solid #eee;margin:24px 0" />')}
          >
            <Minus className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="Image"
            onClick={() => wrap('<img src="https://bmsupport.uk/logo.png" alt="" width="140" style="display:block" />')}
          >
            <Image className="size-4" />
          </Button>
          {placeholders?.length ? (
            <>
              <span className="mx-1 h-5 w-px bg-border" />
              {placeholders.map((p) => (
                <Button key={p} type="button" size="sm" variant="ghost" onClick={() => wrap(`{${p}}`)}>
                  {`{${p}}`}
                </Button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}

      {html && view === "preview" ? (
        <iframe
          title="Email preview"
          className="h-96 w-full rounded-lg border border-border bg-white"
          sandbox=""
          srcDoc={previewDoc}
        />
      ) : (
        <Textarea
          ref={ref}
          className={html ? "min-h-64 font-mono text-xs" : "min-h-28"}
          placeholder={
            html
              ? "Paste or write the email HTML here."
              : "Leave empty to use the standard designed email."
          }
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
          spellCheck={!html}
        />
      )}

      <p className="mt-1 text-xs text-muted-foreground">
        {html
          ? "Your HTML replaces the designed email exactly as written. Leave it empty to go back to the standard design."
          : "Plain wording is wrapped in the standard branded layout. Leave blank to keep the designed email as it is."}
      </p>
    </div>
  );
}
