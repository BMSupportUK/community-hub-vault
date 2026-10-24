import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, CircleHelp, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface Faq {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
}

export function FaqsAdmin({ onBack }: { onBack: () => void }) {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Faq | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("packages_faqs")
      .select("id, question, answer, sort_order")
      .order("sort_order");
    setFaqs((data ?? []) as Faq[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!editing) return;
    if (!editing.question.trim() || !editing.answer.trim()) {
      setError("Both the title and the text are needed.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      question: editing.question.trim(),
      answer: editing.answer.trim(),
      sort_order: editing.sort_order,
    };
    if (editing.id === "new") {
      await supabase.from("packages_faqs").insert(payload);
    } else {
      await supabase.from("packages_faqs").update(payload).eq("id", editing.id);
    }
    setEditing(null);
    setSaving(false);
    void load();
  };

  const remove = async (faq: Faq) => {
    if (!confirm(`Delete "${faq.question}"? This cannot be undone.`)) return;
    await supabase.from("packages_faqs").delete().eq("id", faq.id);
    void load();
  };

  const move = async (index: number, direction: -1 | 1) => {
    const other = index + direction;
    if (other < 0 || other >= faqs.length) return;
    const a = faqs[index];
    const b = faqs[other];
    // Swap positions locally first so the list feels instant.
    const next = [...faqs];
    next[index] = b;
    next[other] = a;
    setFaqs(next);
    await Promise.all([
      supabase.from("packages_faqs").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("packages_faqs").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    void load();
  };

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack} aria-label="Back to Owner tools" title="Back to Owner tools">
          <ArrowLeft className="size-4" />
        </Button>
        <CircleHelp className="size-6 text-primary" />
        <h2 className="font-display text-2xl font-bold">FAQ boxes</h2>
        <div className="ml-auto">
          <Button
            onClick={() =>
              setEditing({ id: "new", question: "", answer: "", sort_order: (faqs.at(-1)?.sort_order ?? 0) + 1 })
            }
          >
            <Plus className="size-4" /> Add FAQ
          </Button>
        </div>
      </header>

      <p className="text-sm text-muted-foreground">
        These boxes appear on the public FAQ page in this order. Edit the title and text, add new ones, delete ones you
        no longer want, or move them up and down.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading FAQs…</p>
      ) : faqs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No FAQs yet — add the first one.</p>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {faqs.map((f, i) => (
            <div key={f.id} className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
              <div className="flex flex-col gap-1 pt-0.5">
                <button
                  onClick={() => void move(i, -1)}
                  disabled={i === 0}
                  className="p-1 rounded-md border border-border hover:bg-muted disabled:opacity-30"
                  title="Move up"
                  aria-label={`Move ${f.question} up`}
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  onClick={() => void move(i, 1)}
                  disabled={i === faqs.length - 1}
                  className="p-1 rounded-md border border-border hover:bg-muted disabled:opacity-30"
                  title="Move down"
                  aria-label={`Move ${f.question} down`}
                >
                  <ArrowDown className="size-3.5" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{f.question}</p>
                <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">{f.answer}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setEditing(f)}
                  className="p-1.5 rounded-md border border-border hover:bg-muted"
                  title="Edit"
                  aria-label={`Edit ${f.question}`}
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => void remove(f)}
                  className="p-1.5 rounded-md border border-border hover:bg-muted text-red-500"
                  title="Delete"
                  aria-label={`Delete ${f.question}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl font-bold">{editing.id === "new" ? "Add FAQ" : "Edit FAQ"}</h3>
              <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Title (the question)</label>
                <input
                  value={editing.question}
                  onChange={(e) => setEditing({ ...editing, question: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-md bg-background border border-border"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Text (the answer)</label>
                <textarea
                  value={editing.answer}
                  onChange={(e) => setEditing({ ...editing, answer: e.target.value })}
                  rows={6}
                  className="w-full mt-1 px-3 py-2 rounded-md bg-background border border-border"
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-md border border-border hover:bg-muted">
                Cancel
              </button>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
              >
                <Save className="size-4" /> {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
