import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { clearAutomatedMessageCache } from "@/lib/automated-messages";
import { EmailHtmlEditor } from "@/components/app/EmailHtmlEditor";

export const Route = createFileRoute("/_authenticated/_approved/admin-automated-messages")({
  component: AdminAutomatedMessagesPage,
});

interface Row {
  key: string;
  label: string;
  description: string;
  category: string;
  channel: string;
  subject: string | null;
  body: string;
  placeholders: string[] | null;
  sort_order: number;
}

function AdminAutomatedMessagesPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin"]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("");

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data, error } = await supabase
        .from("automated_messages")
        .select("key, label, description, category, channel, subject, body, placeholders, sort_order")
        .order("sort_order", { ascending: true });
      if (error) toast.error(error.message);
      else setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
  }, [isAdmin]);

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const r of rows) if (!seen.includes(r.category)) seen.push(r.category);
    return seen;
  }, [rows]);

  useEffect(() => {
    if (!tab && categories.length) setTab(categories[0]!);
  }, [categories, tab]);

  if (!isAdmin) return <Navigate to="/home" />;

  const patch = (key: string, next: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...next } : r)));

  const save = async (row: Row) => {
    setSavingKey(row.key);
    const { error } = await supabase
      .from("automated_messages")
      .update({ body: row.body, subject: row.subject, updated_at: new Date().toISOString() })
      .eq("key", row.key);
    setSavingKey(null);
    if (error) toast.error(error.message);
    else {
      clearAutomatedMessageCache();
      toast.success("Saved");
    }
  };

  const visible = rows.filter((r) => r.category === tab);

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
        Every message and email the system sends on its own — support tickets, sales and orders, and
        all emails. Change the wording any time; it applies straight away. Keep the{" "}
        {"{placeholder}"} tags so details like names, totals and links still fill themselves in.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {categories.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={tab === c ? "default" : "outline"}
            onClick={() => setTab(c)}
          >
            {c === "Emails" ? <Mail className="mr-2 size-4" /> : <MessageSquare className="mr-2 size-4" />}
            {c} ({rows.filter((r) => r.category === c).length})
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {visible.map((row) => (
            <div key={row.key} className="rounded-xl border border-border bg-card p-4">
              <div className="font-semibold">{row.label}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>
              {row.placeholders?.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Tags you can use:{" "}
                  {row.placeholders.map((p) => (
                    <code key={p} className="mr-1 rounded bg-muted px-1 py-0.5">{`{${p}}`}</code>
                  ))}
                </p>
              ) : null}

              {row.channel === "email" ? (
                <>
                  <label className="mt-3 block text-xs font-medium text-muted-foreground">
                    Email subject
                  </label>
                  <Input
                    className="mt-1"
                    value={row.subject ?? ""}
                    onChange={(ev) => patch(row.key, { subject: ev.target.value })}
                  />
                  <label className="mt-3 block text-xs font-medium text-muted-foreground">
                    Email content — HTML
                  </label>
                  <EmailHtmlEditor
                    value={row.body}
                    placeholders={row.placeholders}
                    onChange={(next) => patch(row.key, { body: next })}
                  />
                </>
              ) : (
                <Textarea
                  className="mt-3 min-h-32"
                  value={row.body}
                  onChange={(ev) => patch(row.key, { body: ev.target.value })}
                />
              )}

              <div className="mt-3 flex justify-end">
                <Button size="sm" disabled={savingKey === row.key} onClick={() => save(row)}>
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
