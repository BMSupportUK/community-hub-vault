import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Heading1, Heading2, List, ListOrdered, Link2, Quote, Code, Undo2, Redo2, Eraser, Youtube, Minus, Film, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { MentionCandidate } from "@/hooks/use-mention-candidates";

type Props = {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
  /** Enable an "upload video" button. Provide the userId to scope the storage path. */
  videoUpload?: { userId: string | null | undefined; bucket?: string; folder?: string };
  /**
   * Optional transform applied to pasted plain text BEFORE insertion. Return
   * an HTML string. When set, the editor intercepts paste events, reads the
   * text/plain payload, runs it through this function, and inserts the
   * returned HTML. Use to normalize copy/pasted listings into a specific
   * block layout (e.g. sports guides: one event per block).
   */
  pasteTransform?: (plainText: string) => string;
  /** Optional @mention autocomplete. Provide the candidate list. */
  mentions?: MentionCandidate[];
};

function exec(cmd: string, arg?: string) {
  document.execCommand(cmd, false, arg);
}

export function HtmlEditor({ value, onChange, className, placeholder, videoUpload, pasteTransform, mentions }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [mention, setMention] = useState<{
    query: string;
    rect: { top: number; left: number };
    range: Range;
    triggerNode: Text;
    triggerOffset: number;
  } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const refreshActive = () => {
    if (typeof document === "undefined") return;
    const block = (() => {
      try { return document.queryCommandValue("formatBlock")?.toString().toLowerCase() ?? ""; }
      catch { return ""; }
    })();
    const q = (cmd: string) => {
      try { return document.queryCommandState(cmd); } catch { return false; }
    };
    setActive({
      bold: q("bold"),
      italic: q("italic"),
      underline: q("underline"),
      h1: block.includes("h1"),
      h2: block.includes("h2"),
      quote: block.includes("blockquote"),
      pre: block.includes("pre"),
      ul: q("insertUnorderedList"),
      ol: q("insertOrderedList"),
    });
  };

  // Initialize / sync external value when it changes from outside (e.g. switching record)
  useEffect(() => {
    if (!ref.current) return;
    if (ref.current.innerHTML !== (value ?? "")) {
      ref.current.innerHTML = value ?? "";
    }
  }, [value]);

  const handleInput = () => {
    if (ref.current) onChange(ref.current.innerHTML);
    refreshActive();
    updateMentionState();
  };

  const closeMention = () => setMention(null);

  const updateMentionState = () => {
    if (!mentions || mentions.length === 0) { setMention(null); return; }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) { setMention(null); return; }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { setMention(null); return; }
    if (!ref.current?.contains(node)) { setMention(null); return; }
    const text = (node as Text).data.slice(0, range.startOffset);
    const m = text.match(/(?:^|\s)@([\w-]{0,30})$/);
    if (!m) { setMention(null); return; }
    const query = m[1];
    const triggerOffset = range.startOffset - query.length - 1;
    const probe = document.createRange();
    probe.setStart(node, triggerOffset);
    probe.setEnd(node, triggerOffset);
    const rect = probe.getBoundingClientRect();
    const editorRect = ref.current.getBoundingClientRect();
    setMention({
      query,
      rect: { top: rect.bottom - editorRect.top + 4, left: rect.left - editorRect.left },
      range,
      triggerNode: node as Text,
      triggerOffset,
    });
    setMentionIndex(0);
  };

  const filteredMentions = (() => {
    if (!mention || !mentions) return [];
    const q = mention.query.toLowerCase();
    const matches = mentions.filter((c) => {
      if (!q) return true;
      return c.label.toLowerCase().includes(q) || (c.sublabel ?? "").toLowerCase().includes(q) || c.key.toLowerCase().includes(q);
    });
    return matches.slice(0, 8);
  })();

  const insertMention = (c: MentionCandidate) => {
    if (!mention || !ref.current) return;
    const node = mention.triggerNode;
    // Delete the "@query" trigger text
    const deleteRange = document.createRange();
    deleteRange.setStart(node, mention.triggerOffset);
    deleteRange.setEnd(node, mention.triggerOffset + mention.query.length + 1);
    deleteRange.deleteContents();
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(deleteRange); }
    ref.current.focus();
    const safeLabel = c.label.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
    const attrs = c.type === "user"
      ? `data-mention-type="user" data-mention-id="${c.key}"`
      : `data-mention-type="special" data-mention-key="${c.key}"`;
    const html = `<span class="mention" ${attrs}>@${safeLabel}</span>&nbsp;`;
    exec("insertHTML", html);
    setMention(null);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!mention || filteredMentions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % filteredMentions.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + filteredMentions.length) % filteredMentions.length); }
    else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(filteredMentions[mentionIndex] ?? filteredMentions[0]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMention();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!pasteTransform) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const html = pasteTransform(text);
    ref.current?.focus();
    exec("insertHTML", html);
    handleInput();
  };

  const Btn = ({ onClick, title, isActive, children }: { onClick: () => void; title: string; isActive?: boolean; children: React.ReactNode }) => (
    <button
      type="button"
      onMouseDown={(e) => {
        // Prevent the toolbar button from stealing focus / collapsing the
        // current selection inside the contenteditable. Then ensure the
        // editor is focused so execCommand has a valid selection to act on
        // (otherwise list / format buttons silently do nothing when the
        // editor hasn't been clicked yet).
        e.preventDefault();
        if (ref.current && document.activeElement !== ref.current) {
          ref.current.focus();
        }
        onClick();
      }}
      title={title}
      className={`p-1.5 rounded transition-colors ${isActive ? "bg-primary/20 text-primary ring-1 ring-primary/40" : "hover:bg-accent text-foreground/80 hover:text-foreground"}`}
    >
      {children}
    </button>
  );

  const promptLink = () => {
    const url = window.prompt("Link URL");
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed) return;
    const title = window.prompt("Link title (shown on the preview card)", "")?.trim();
    ref.current?.focus();
    const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
    const titleAttr = title ? ` data-link-title="${esc(title)}"` : "";
    const html = `<div data-link-preview="${esc(trimmed)}"${titleAttr}></div><p><br/></p>`;
    exec("insertHTML", html);
    handleInput();
  };

  const extractYouTubeId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
      /^([A-Za-z0-9_-]{11})$/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  };

  const promptYouTube = () => {
    const url = window.prompt("YouTube URL or video ID");
    if (!url) return;
    const id = extractYouTubeId(url.trim());
    if (!id) {
      window.alert("Could not detect a YouTube video from that URL.");
      return;
    }
    ref.current?.focus();
    const html = `<div class="video-embed" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:0;width:100%;border-radius:0.5rem;"><iframe src="https://www.youtube.com/embed/${id}" title="YouTube video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"></iframe></div><p><br/></p>`;
    exec("insertHTML", html);
    handleInput();
  };

  const uploadVideo = async (file: File) => {
    if (!videoUpload) return;
    if (!file.type.startsWith("video/")) { toast.error("Please choose a video file"); return; }
    if (file.size > 100 * 1024 * 1024) { toast.error("Video must be under 100MB"); return; }
    const bucket = videoUpload.bucket ?? "kb-videos";
    const folder = videoUpload.folder ? `${videoUpload.folder}/` : "";
    const owner = videoUpload.userId ?? "anon";
    const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
    const path = `${owner}/${folder}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    setUploadingVideo(true);
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: "3600", upsert: false, contentType: file.type,
    });
    if (error) { setUploadingVideo(false); toast.error(error.message); return; }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    ref.current?.focus();
    const html = `<p><video src="${data.publicUrl}" controls playsinline style="max-width:100%;border-radius:0.5rem;margin:1rem 0;"></video></p><p><br/></p>`;
    exec("insertHTML", html);
    handleInput();
    setUploadingVideo(false);
    toast.success("Video uploaded");
  };

  return (
    <div className={`relative rounded-md border border-border bg-background ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border p-1">
        <Btn title="Bold" isActive={active.bold} onClick={() => { exec("bold"); handleInput(); }}><Bold className="size-4" /></Btn>
        <Btn title="Italic" isActive={active.italic} onClick={() => { exec("italic"); handleInput(); }}><Italic className="size-4" /></Btn>
        <Btn title="Underline" isActive={active.underline} onClick={() => { exec("underline"); handleInput(); }}><Underline className="size-4" /></Btn>
        <span className="mx-1 h-5 w-px bg-border" />
        <Btn title="Heading 1" isActive={active.h1} onClick={() => { exec("formatBlock", "<h1>"); handleInput(); }}><Heading1 className="size-4" /></Btn>
        <Btn title="Heading 2" isActive={active.h2} onClick={() => { exec("formatBlock", "<h2>"); handleInput(); }}><Heading2 className="size-4" /></Btn>
        <Btn title="Quote" isActive={active.quote} onClick={() => { exec("formatBlock", "<blockquote>"); handleInput(); }}><Quote className="size-4" /></Btn>
        <Btn title="Code" isActive={active.pre} onClick={() => { exec("formatBlock", "<pre>"); handleInput(); }}><Code className="size-4" /></Btn>
        <span className="mx-1 h-5 w-px bg-border" />
        <Btn title="Bullet list" isActive={active.ul} onClick={() => { exec("insertUnorderedList"); handleInput(); }}><List className="size-4" /></Btn>
        <Btn title="Numbered list" isActive={active.ol} onClick={() => { exec("insertOrderedList"); handleInput(); }}><ListOrdered className="size-4" /></Btn>
        <Btn title="Link" onClick={promptLink}><Link2 className="size-4" /></Btn>
        <Btn title="Embed YouTube video" onClick={promptYouTube}><Youtube className="size-4" /></Btn>
        {videoUpload && (
          <>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVideo(f); e.currentTarget.value = ""; }}
            />
            <Btn
              title={uploadingVideo ? "Uploading video…" : "Upload video"}
              onClick={() => { if (!uploadingVideo) videoInputRef.current?.click(); }}
            >
              {uploadingVideo ? <Loader2 className="size-4 animate-spin" /> : <Film className="size-4" />}
            </Btn>
          </>
        )}
        <Btn title="Horizontal line" onClick={() => { exec("insertHorizontalRule"); handleInput(); }}><Minus className="size-4" /></Btn>
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
        onPaste={handlePaste}
        onKeyUp={() => { refreshActive(); updateMentionState(); }}
        onKeyDown={handleKeyDown}
        onMouseUp={() => { refreshActive(); updateMentionState(); }}
        onBlur={() => { setTimeout(closeMention, 150); }}
        onFocus={refreshActive}
        data-placeholder={placeholder}
        className="prose prose-sm dark:prose-invert max-w-none min-h-[180px] px-3 py-2 focus:outline-none [&[data-placeholder]:empty::before]:content-[attr(data-placeholder)] [&[data-placeholder]:empty::before]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_a]:text-primary [&_a]:underline"
      />
      {mention && filteredMentions.length > 0 && (
        <div
          className="absolute z-50 min-w-[220px] max-w-[300px] rounded-md border border-border bg-popover shadow-lg overflow-hidden text-sm"
          style={{ top: mention.rect.top, left: Math.max(8, mention.rect.left) }}
        >
          {filteredMentions.map((c, i) => (
            <button
              key={`${c.type}:${c.key}`}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertMention(c); }}
              onMouseEnter={() => setMentionIndex(i)}
              className={`w-full text-left flex items-center gap-2 px-2.5 py-1.5 ${i === mentionIndex ? "bg-accent" : ""}`}
            >
              {c.type === "user" ? (
                <span className="size-6 rounded-full bg-gradient-to-br from-[#E11B22] to-[#8B0F14] grid place-items-center text-[10px] font-bold text-white overflow-hidden shrink-0">
                  {c.avatarUrl ? <img src={c.avatarUrl} alt="" className="size-6 object-cover" /> : c.label.slice(0, 1).toUpperCase()}
                </span>
              ) : (
                <span className="size-6 rounded-full bg-[#F4B400]/20 text-[#F4B400] grid place-items-center text-[10px] font-bold shrink-0">@</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">@{c.label}{c.isStaff && <span className="ml-1 text-[9px] uppercase tracking-wider text-[#F4B400]">staff</span>}</span>
                {c.sublabel && <span className="block truncate text-[11px] text-muted-foreground">{c.sublabel}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}