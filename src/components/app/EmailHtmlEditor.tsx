import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Code2,
  Eye,
  Bold,
  Italic,
  Link2,
  Heading1,
  MousePointerClick,
  Minus,
  Loader2,
  Upload,
  Sparkles,
} from "lucide-react";

const IMAGE_BASE = "https://bmsupport.uk/api/public/email-image";

const STARTER_HTML = `<div style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,sans-serif">
  <h1 style="font-size:22px;color:#111;margin:0 0 12px">Heading</h1>
  <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 16px">Your message goes here.</p>
  <a href="https://bmsupport.uk" style="display:inline-block;background:#e11d48;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Open BM Support</a>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
  <p style="font-size:12px;color:#999;margin:0">BM Support</p>
</div>`;

const looksLikeHtml = (body: string) =>
  /<\s*(html|body|div|table|p|a|h1|h2|h3|span|img|br|td|tr|center|section)\b|<!doctype/i.test(body);

/** Wrap any legacy plain wording in simple HTML so every email stays HTML-only. */
const toHtml = (body: string) => {
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (looksLikeHtml(trimmed)) return body;
  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map(
      (p) =>
        `  <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 12px">${p
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/\n/g, "<br />")}</p>`,
    )
    .join("\n");
  return `<div style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,sans-serif">\n${paragraphs}\n</div>`;
};

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholders?: string[] | null;
}

/** HTML-only email body editor with a toolbar, image upload and live preview. */
export function EmailHtmlEditor({ value, onChange, placeholders }: Props) {
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

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Images must be 5MB or smaller");
      return;
    }
    setUploading(true);
    const ext = (file.name.split(".").pop() ?? "png").replace(/[^a-z0-9]/gi, "").toLowerCase();
    const name = `${crypto.randomUUID()}.${ext || "png"}`;
    const { error } = await supabase.storage
      .from("email-assets")
      .upload(name, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    wrap(`<img src="${IMAGE_BASE}/${name}" alt="" width="560" style="display:block;max-width:100%" />`);
    toast.success("Image uploaded");
  };

  const isPlain = value.trim().length > 0 && !looksLikeHtml(value);

  return (
    <div className="mt-1">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={view === "code" ? "secondary" : "ghost"}
          onClick={() => setView("code")}
        >
          <Code2 className="mr-2 size-4" /> HTML
        </Button>
        <Button
          type="button"
          size="sm"
          variant={view === "preview" ? "secondary" : "ghost"}
          onClick={() => setView("preview")}
        >
          <Eye className="mr-2 size-4" /> Preview
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          title="Insert a starter layout"
          onClick={() => onChange(value.trim() ? value : STARTER_HTML)}
        >
          <Sparkles className="mr-2 size-4" /> Starter layout
        </Button>
        {isPlain ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onChange(toHtml(value))}>
            Convert to HTML
          </Button>
        ) : null}
      </div>

      {view === "code" ? (
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
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(ev) => {
              const file = ev.target.files?.[0];
              ev.target.value = "";
              if (file) void upload(file);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            title="Upload an image"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Upload className="mr-2 size-4" />
            )}
            Upload image
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

      {view === "preview" ? (
        <iframe
          title="Email preview"
          className="h-96 w-full rounded-lg border border-border bg-white"
          sandbox=""
          srcDoc={previewDoc}
        />
      ) : (
        <Textarea
          ref={ref}
          className="min-h-64 font-mono text-xs"
          placeholder="Write the email HTML here. Leave empty to use the standard designed email."
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
          spellCheck={false}
        />
      )}

      <p className="mt-1 text-xs text-muted-foreground">
        All emails are sent as HTML. Your HTML replaces the designed email exactly as written — leave it empty to keep
        the standard design.
      </p>
    </div>
  );
}
