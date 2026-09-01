import { useState } from "react";
import { BookOpen, FileText, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openGuide } from "@/lib/guide-vault.functions";

type UnlockResult = {
  url: string | null;
  viewUrl: string | null;
  fileName: string | null;
  body: string | null;
};

/**
 * "Read guide" action for a stored guide. Members with guide access open it
 * straight away — no passcode step.
 */
export function GuideVaultCardActions({
  blogId,
  onOpen,
}: {
  blogId: string;
  title?: string;
  onOpen: (result: UnlockResult) => void;
}) {
  const open = useServerFn(openGuide);
  const [busy, setBusy] = useState(false);

  const read = async () => {
    setBusy(true);
    try {
      const res = await open({ data: { blogId } });
      if (!res.ok) {
        toast.error("Couldn't open this guide.");
        return;
      }
      onOpen({
        url: res.url ?? null,
        viewUrl: res.viewUrl ?? null,
        fileName: res.fileName ?? null,
        body: res.body ?? null,
      });
    } catch {
      toast.error("Couldn't open this guide — please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex items-center gap-2">
      <Button
        size="sm"
        onClick={read}
        disabled={busy}
        className="flex-1 bg-gradient-primary text-primary-foreground hover:opacity-90"
      >
        {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <BookOpen className="size-4 mr-1" />}
        Read guide
      </Button>
    </div>
  );
}

export function GuideFileIcon() {
  return <FileText className="size-10" />;
}
