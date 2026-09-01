import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lock, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestAppDownloadAccess } from "@/lib/app-transfer.functions";

/**
 * Shown to members without the subscriber role. Instead of the protected
 * content they get a single button that notifies the admin team.
 */
export function AccessRequestPanel({
  section,
  title,
  description,
}: {
  section: "download" | "guides";
  title: string;
  description: string;
}) {
  const askAccess = useServerFn(requestAppDownloadAccess);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onAsk = async () => {
    setBusy(true);
    try {
      const res = await askAccess({ data: { section } });
      setSent(true);
      toast.success(
        res?.alreadySent
          ? "Your request is already with the admin team"
          : "Request sent — an admin has been notified",
      );
    } catch {
      toast.error("Couldn't send your request, please try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-violet-500/30 bg-violet-950/40 p-6">
      <h3 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
        <Lock className="size-5 text-violet-300" /> {title}
      </h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-prose">{description}</p>
      <Button
        onClick={onAsk}
        disabled={busy || sent}
        className="mt-4 bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
      >
        {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <ShieldCheck className="size-4 mr-1" />}
        {sent ? "Request sent" : "Request access"}
      </Button>
    </section>
  );
}
