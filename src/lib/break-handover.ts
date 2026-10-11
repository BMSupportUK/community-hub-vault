import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Before a break/main break: if the staff member has open tickets, offer to pass
 * them to another on-shift colleague (posts an automated message in each
 * ticket and notifies the new assignee). Returns false if the user cancels.
 */
export async function offerTicketHandover(userId: string, kind: "break" | "lunch"): Promise<boolean> {
  const { count } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", userId)
    .in("status", ["open", "in_progress"])
    .is("archived_at", null);
  if (!count) return true;
  const label = kind === "lunch" ? "your main break" : "your break";
  const pass = window.confirm(
    `You're dealing with ${count} ticket${count === 1 ? "" : "s"}.\n\nPress OK to pass ${count === 1 ? "it" : "them"} to another member of staff before ${label}, or Cancel to keep ${count === 1 ? "it" : "them"}.`,
  );
  if (!pass) return true;
  const { data, error } = await supabase.rpc("handover_tickets_for_break", { _kind: kind });
  if (error) {
    toast.error("Couldn't pass tickets over: " + error.message);
    return true;
  }
  const r = (data ?? {}) as { passed?: number; kept?: number };
  if (r.passed) toast.success(`${r.passed} ticket${r.passed === 1 ? "" : "s"} passed to another member of staff`);
  if (r.kept) toast.warning(`${r.kept} ticket${r.kept === 1 ? "" : "s"} kept — no one else is free to take ${r.kept === 1 ? "it" : "them"}`);
  return true;
}
