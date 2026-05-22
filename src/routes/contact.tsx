import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Send, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => ({
    meta: [
      { title: "Contact Us — BM Support" },
      { name: "description", content: "Get in touch with the BM Support team. Send us a message and we'll get back to you." },
    ],
  }),
});

const ContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(5000),
});

function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "", website: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((er) => ({ ...er, [k]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    // Honeypot — bots will fill hidden field
    if (form.website) {
      setSuccess(true);
      return;
    }

    const parsed = ContactSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        if (issue.path[0]) fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("contact_submissions").insert({
      name: parsed.data.name,
      email: parsed.data.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
      user_agent: navigator.userAgent.slice(0, 500),
    });
    setSubmitting(false);

    if (error) {
      setServerError("Something went wrong. Please try again.");
      return;
    }
    setSuccess(true);
    setForm({ name: "", email: "", subject: "", message: "", website: "" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="px-8 py-5 flex items-center justify-between border-b border-border">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 shadow-[0_0_30px_rgba(220,38,38,0.6)] grid place-items-center font-display font-bold text-[13px] text-white">BM</div>
          <span className="font-display font-bold text-lg">Support</span>
        </Link>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="size-4" /> Back home
        </Link>
      </header>

      <main className="px-6 py-12 md:py-16 max-w-2xl mx-auto">
        <h1 className="font-display text-3xl md:text-4xl font-bold mb-3">Contact Us</h1>
        <p className="text-muted-foreground mb-8">Have a question or need help? Send us a message and we'll get back to you as soon as we can.</p>

        {success ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
            <CheckCircle2 className="size-10 text-emerald-400 mx-auto mb-3" />
            <h2 className="font-display font-semibold text-xl mb-1">Message sent</h2>
            <p className="text-sm text-muted-foreground mb-4">Thanks for reaching out. We'll be in touch shortly.</p>
            <button onClick={() => setSuccess(false)} className="text-sm text-red-500 hover:text-red-400">Send another message</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Honeypot */}
            <input
              type="text"
              name="website"
              value={form.website}
              onChange={update("website")}
              tabIndex={-1}
              autoComplete="off"
              className="absolute left-[-9999px] opacity-0 pointer-events-none"
              aria-hidden="true"
            />

            <div className="grid md:grid-cols-2 gap-5">
              <Field label="Name" error={errors.name}>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={update("name")}
                  className="w-full px-3 py-2.5 rounded-md bg-background border border-border focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                />
              </Field>
              <Field label="Email" error={errors.email}>
                <input
                  type="email"
                  required
                  maxLength={255}
                  value={form.email}
                  onChange={update("email")}
                  className="w-full px-3 py-2.5 rounded-md bg-background border border-border focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                />
              </Field>
            </div>

            <Field label="Subject" error={errors.subject}>
              <input
                type="text"
                required
                maxLength={200}
                value={form.subject}
                onChange={update("subject")}
                className="w-full px-3 py-2.5 rounded-md bg-background border border-border focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
              />
            </Field>

            <Field label="Message" error={errors.message}>
              <textarea
                required
                maxLength={5000}
                rows={6}
                value={form.message}
                onChange={update("message")}
                className="w-full px-3 py-2.5 rounded-md bg-background border border-border focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none resize-y"
              />
              <p className="text-xs text-muted-foreground mt-1">{form.message.length}/5000</p>
            </Field>

            {serverError && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">{serverError}</div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium shadow-[0_0_24px_rgba(220,38,38,0.45)] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Send className="size-4" />
              {submitting ? "Sending…" : "Send message"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1.5">{label}</span>
      {children}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </label>
  );
}
