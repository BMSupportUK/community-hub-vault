import { useEffect, useState } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Embed {
  channel_id: string;
  title: string;
  body: string;
  image_url: string | null;
}

export function ChannelWelcomeEmbed({
  channelId,
  canEdit,
}: {
  channelId: string;
  canEdit: boolean;
}) {
  const [embed, setEmbed] = useState<Embed | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [imageDraft, setImageDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("channel_welcome_embeds")
        .select("channel_id, title, body, image_url")
        .eq("channel_id", channelId)
        .maybeSingle();
      if (cancelled) return;
      setEmbed(data as Embed | null);
      setLoading(false);
    })();

    const ch = supabase
      .channel(`welcome-embed:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "channel_welcome_embeds",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") setEmbed(null);
          else setEmbed(payload.new as Embed);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [channelId]);

  const startEdit = () => {
    setTitleDraft(embed?.title ?? "Welcome");
    setBodyDraft(embed?.body ?? "");
    setImageDraft(embed?.image_url ?? "");
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    const payload = {
      channel_id: channelId,
      title: titleDraft.trim() || "Welcome",
      body: bodyDraft,
      image_url: imageDraft.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("channel_welcome_embeds")
      .upsert(payload, { onConflict: "channel_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome message updated");
    setEditing(false);
  };

  if (loading) return null;
  if (!embed && !canEdit) return null;

  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-surface-2 shadow-sm relative group">
      {(embed?.image_url || (editing && imageDraft)) && (
        <img
          src={editing ? imageDraft || embed?.image_url || "" : embed?.image_url || ""}
          alt=""
          className="block w-full h-auto object-contain"
          loading="lazy"
        />
      )}
      <div className="p-4 sm:p-5 space-y-2">
        {editing ? (
          <>
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder="Title"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-semibold"
            />
            <input
              value={imageDraft}
              onChange={(e) => setImageDraft(e.target.value)}
              placeholder="Image URL (optional)"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs"
            />
            <textarea
              value={bodyDraft}
              onChange={(e) => setBodyDraft(e.target.value)}
              rows={6}
              placeholder="Message body — supports line breaks and emoji"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm resize-y"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setEditing(false)}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg hover:bg-surface-1 text-muted-foreground"
              >
                <X className="size-3.5" /> Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className={cn(
                  "flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
                )}
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Save
              </button>
            </div>
          </>
        ) : embed ? (
          <>
            <h3 className="font-display font-bold text-base">{embed.title}</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {embed.body}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground italic">No welcome message — click edit to add one.</p>
        )}
      </div>
      {canEdit && !editing && (
        <button
          onClick={startEdit}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-background/80 backdrop-blur border border-border hover:border-primary"
          title="Edit welcome message"
        >
          <Pencil className="size-3.5" /> Edit
        </button>
      )}
    </div>
  );
}
