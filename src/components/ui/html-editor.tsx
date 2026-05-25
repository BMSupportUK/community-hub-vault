import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Heading1, Heading2, List, ListOrdered, Link2, Quote, Code, Undo2, Redo2, Eraser, Youtube, Minus, Film, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Props = {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
  /** Enable an "upload video" button. Provide the userId to scope the storage path. */
  videoUpload?: { userId: string | null | undefined; bucket?: string; folder?: string };
};

function exec(cmd: string, arg?: string) {
  document.execCommand(cmd, false, arg);
}

export function HtmlEditor({ value, onChange, className, placeholder, videoUpload }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [active, setActive] = useState<Record<string, boolean>>({});

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
    exec("createLink", url);
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
    const html = `<div class="video-embed" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:1rem 0;border-radius:0.5rem;"><iframe src="https://www.youtube.com/embed/${id}" title="YouTube video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"></iframe></div><p><br/></p>`;
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
    <div className={`rounded-md border border-border bg-background ${className ?? ""}`}>
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
        onKeyUp={refreshActive}
        onMouseUp={refreshActive}
        onFocus={refreshActive}
        data-placeholder={placeholder}
        className="prose prose-sm dark:prose-invert max-w-none min-h-[180px] px-3 py-2 focus:outline-none [&[data-placeholder]:empty::before]:content-[attr(data-placeholder)] [&[data-placeholder]:empty::before]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_a]:text-primary [&_a]:underline"
      />
    </div>
  );
}