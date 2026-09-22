import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, MessageSquare, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { clearAutomatedMessageCache } from "@/lib/automated-messages";

export const Route = createFileRoute("/_authenticated/_approved/admin-automated-messages")({
  component: AdminAutomatedMessagesPage,
});

interface MsgRow {
  key: string;
  label: string;
  description: string;
  body: string;
  placeholders: string[] | null;
  sort_order: number;
}

interface EmailRow {
  key: string;
  subject: string;
  text_body: string;
  html_body: string;
}

function AdminAutomatedMessagesPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin"]);
  const [tab, setTab] = useState<"messages" | "emails">("messages");
  const [msgs, setMsgs] = useState<MsgRow[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const [m, e] = await Promise.all([
        supabase
          .from("automated_messages")
          .select("key, label, description, body, placeholders, sort_order")
          .order("sort_order", { ascending: true }),
        supabase.from("email_templates").select("key, subject, text_body, html_body").order("key"),
      ]);
      if (m.error) toast.error(m.error.message);
      else setMsgs((m.data ?? []) as MsgRow[]);
      if (!e.error) setEmails((e.data ?? []) as EmailRow[]);
      setLoading(false);
    })();
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/home" />;

  const saveMessage = async (row: MsgRow) => {
    setSavingKey(row.key);
    const { error } = await supabase
      .from("automated_messages")
      .update({ body: row.body, updated_at: new Date().toISOString() })
      .eq("key", row.key);
    setSavingKey(null);
    if (error) toast.error(error.message);
    else {
      clearAutomatedMessageCache();
      toast.success("Message saved");
    }
  };

  const saveEmail = async (row: EmailRow) => {
    setSavingKey(row.key);
    const { error } = await supabase
      .from("email_templates")
      .update({ subject: row.subject, text_body: row.text_body, html_body: row.html_body })
      .eq("key", row.key);
    setSavingKey(null);
    if (error) toast.error(error.message);
    else toast.success("Email saved");
  };

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <Link
        to="/admin"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to BM Support | Admin Dashboard
      </Link>

      <h1 className="text-2xl font-bold">Automated messages &amp; emails</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every message the system sends on its own. Change the wording any time — updates apply
        straight away. Keep any {"{placeholder}"} tags so the details still fill themselves in.
      </p>

      <div className="mt-4 flex gap-2">
        <Button
          variant={tab === "messages" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("messages")}
        >
          <MessageSquare className="mr-2 size-4" /> Automated messages ({msgs.length})
        </Button>
        <Button
          variant={tab === "emails" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("emails")}
        >
          <Mail className="mr-2 size-4" /> Emails ({emails.length})
        </Button>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : tab === "messages" ? (
        <div className="mt-5 space-y-4">
          {msgs.map((row) => (
            <div key={row.key} className="rounded-xl border border-border bg-card p-4">
              <div className="font-semibold">{row.label}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>
              {row.placeholders?.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Available tags:{" "}
                  {row.placeholders.map((p) => (
                    <code key={p} className="mr-1 rounded bg-muted px-1 py-0.5">{`{${p}}`}</code>
                  ))}
                </p>
              ) : null}
              <Textarea
                className="mt-3 min-h-32"
                value={row.body}
                onChange={(ev) =>
                  setMsgs((prev) =>
                    prev.map((r) => (r.key === row.key ? { ...r, body: ev.target.value } : r)),
                  )
                }
              />
              <div className="mt-3 flex justify-end">
                <Button size="sm" disabled={savingKey === row.key} onClick={() => saveMessage(row)}>
                  {savingKey === row.key ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 size-4" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : emails.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No email templates are set up yet, so nothing to edit here.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {emails.map((row) => (
            <div key={row.key} className="rounded-xl border border-border bg-card p-4">
              <div className="font-semibold">{row.key}</div>
              <label className="mt-3 block text-xs font-medium text-muted-foreground">Subject</label>
              <Input
                className="mt-1"
                value={row.subject}
                onChange={(ev) =>
                  setEmails((prev) =>
                    prev.map((r) => (r.key === row.key ? { ...r, subject: ev.target.value } : r)),
                  )
                }
              />
              <label className="mt-3 block text-xs font-medium text-muted-foreground">
                Plain text version
              </label>
              <Textarea
                className="mt-1 min-h-24"
                value={row.text_body}
                onChange={(ev) =>
                  setEmails((prev) =>
                    prev.map((r) => (r.key === row.key ? { ...r, text_body: ev.target.value } : r)),
                  )
                }
              />
              <label className="mt-3 block text-xs font-medium text-muted-foreground">
                Designed (HTML) version
              </label>
              <Textarea
                className="mt-1 min-h-32 font-mono text-xs"
                value={row.html_body}
                onChange={(ev) =>
                  setEmails((prev) =>
                    prev.map((r) => (r.key === row.key ? { ...r, html_body: ev.target.value } : r)),
                  )
                }
              />
              <div className="mt-3 flex justify-end">
                <Button size="sm" disabled={savingKey === row.key} onClick={() => saveEmail(row)}>
                  {savingKey === row.key ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 size-4" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
