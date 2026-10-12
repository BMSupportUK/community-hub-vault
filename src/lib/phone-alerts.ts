// Single source of truth for Android phone alerts: every push kind maps to
// its own channel and bundled tone so each alert sounds different.
// Android locks a channel's sound forever — change the channel id (bump _vN)
// whenever a tone is corrected.

export interface PhoneAlert {
  key: string;
  label: string;
  when: string;
  channel: string;
  tone: string; // file in android/app/src/main/res/raw (no extension)
  kinds: string[]; // push data.kind values routed here
  event?: string; // optional data.event match (incidents)
  isNew?: boolean;
  /** Who receives this alert for real. */
  audience?: "management"; // tone created in the uniqueness pass
}

export const PHONE_ALERTS: readonly PhoneAlert[] = [
  { key: "ticket", label: "New ticket", when: "Ticket opened / left unanswered", channel: "bm_support_tickets_v6", tone: "ticket_tone", kinds: ["ticket", "ticket_raised", "ticket_raised_owner"] },
  { key: "ticket_reply", label: "Ticket reply", when: "Customer replies to your ticket", channel: "bm_support_ticket_replies_v5", tone: "ticket_reply_tone", kinds: ["ticket_reply"] },
  { key: "ticket_assigned", label: "Ticket assigned", when: "A ticket is assigned to / picked up by you", channel: "bm_alert_ticket_assigned_v3", tone: "ticket_assigned_tone", kinds: ["ticket_assigned", "ticket_picked_up"], isNew: true },
  { key: "ticket_handover", label: "Ticket handed over", when: "A colleague passes you a ticket before a break", channel: "bm_alert_ticket_handover_v3", tone: "ticket_handover_tone", kinds: ["ticket_handover"], isNew: true },
  { key: "ticket_help", label: "Ticket help requested", when: "A colleague asks for help on a ticket", channel: "bm_alert_ticket_help_v3", tone: "ticket_help_tone", kinds: ["ticket_help_requested"], isNew: true },
  { key: "mention", label: "Mention", when: "@mention in chat or forum", channel: "bm_support_mentions_v4", tone: "mention_tone", kinds: ["mention"] },
  { key: "dm", label: "Inbox / direct message", when: "New private message", channel: "bm_alert_dm_v3", tone: "dm_tone", kinds: ["dm", "dm_message"], isNew: true },
  { key: "order", label: "Sale / Order", when: "New order placed", channel: "bm_support_orders_v4", tone: "order_tone", kinds: ["order", "order_placed"], audience: "management" },
  { key: "payment", label: "Payment confirmed", when: "Payment confirmed on an outstanding order", channel: "bm_support_payments_v4", tone: "payment_tone", kinds: ["order_paid", "invoice_paid", "wise_payment"], audience: "management" },
  { key: "checkout_chat", label: "Checkout chat", when: "Customer messages on a secure checkout", channel: "bm_alert_checkout_chat_v3", tone: "checkout_chat_tone", kinds: ["checkout_chat"], isNew: true, audience: "management" },
  { key: "live_help", label: "Live help request", when: "Customer asks for live help", channel: "bm_alert_live_help_v3", tone: "live_help_tone", kinds: ["live_help"], isNew: true, audience: "management" },
  { key: "signup", label: "New signup / access request", when: "New member hits the security gate", channel: "bm_alert_signup_v3", tone: "signup_tone", kinds: ["signup", "gate_application"], isNew: true, audience: "management" },
  { key: "gate_message", label: "Gate message", when: "Applicant messages from the gate", channel: "bm_alert_gate_message_v3", tone: "gate_message_tone", kinds: ["gate_message"], isNew: true, audience: "management" },
  { key: "guide_access", label: "Guide / app access", when: "Guide or app access granted, revoked or requested", channel: "bm_alert_guide_access_v3", tone: "guide_access_tone", kinds: ["guide_access_granted", "guide_access_revoked", "guide_passcode", "install_guides_access_request", "app_download_access_request"], isNew: true, audience: "management" },
  { key: "content_report", label: "Content reported", when: "Post or message reported", channel: "bm_alert_content_report_v3", tone: "content_report_tone", kinds: ["content_report"], isNew: true, audience: "management" },
  { key: "shift_start", label: "Shift start", when: "Rota shift about to start", channel: "bm_support_shift_start_v7", tone: "shift_start_tone", kinds: ["shift_start", "shift_start_warn"] },
  { key: "auto_clock_in", label: "Auto clock-in", when: "Shift auto clocked in", channel: "bm_alert_auto_clock_in_v3", tone: "auto_clock_in_tone", kinds: ["shift_auto_clock_in", "staff_auto_clock_in"], isNew: true },
  { key: "shift_end", label: "Shift ending soon", when: "Rota shift about to end", channel: "bm_support_shift_end_v7", tone: "shift_end_tone", kinds: ["shift_end", "shift_end_warn"] },
  { key: "shift_over", label: "Shift has ended", when: "Shift end time reached while signed in", channel: "bm_alert_shift_over_v3", tone: "shift_over_tone", kinds: ["shift_end_over"], isNew: true },
  { key: "cover_request", label: "Cover sign-in request", when: "Staff asks to sign in for cover", channel: "bm_alert_cover_request_v3", tone: "cover_request_tone", kinds: ["cover_request"], isNew: true, audience: "management" },
  { key: "cover_approved", label: "Cover approved", when: "Your cover request was approved", channel: "bm_alert_cover_approved_v3", tone: "cover_approved_tone", kinds: ["shift_start_cover_approved"], isNew: true },
  { key: "cover_declined", label: "Cover declined", when: "Your cover request was declined", channel: "bm_alert_cover_declined_v3", tone: "cover_declined_tone", kinds: ["cover_declined"], isNew: true },
  { key: "early_finish", label: "Early finish", when: "Early finish requested / decided", channel: "bm_alert_early_finish_v3", tone: "early_finish_tone", kinds: ["early_finish"], isNew: true, audience: "management" },
  { key: "break_due", label: "Break due", when: "Allocated Break 1 / Main break / Break 2 time arrives", channel: "bm_alert_break_due_v3", tone: "break_due_tone", kinds: ["break_warn"], isNew: true },
  { key: "break_ending", label: "Break ending", when: "Break nearly over", channel: "bm_alert_break_ending_v3", tone: "break_ending_tone", kinds: ["break_ending"], isNew: true },
  { key: "main_break_ending", label: "Main break ending", when: "Main break nearly over", channel: "bm_alert_main_break_ending_v3", tone: "main_break_ending_tone", kinds: ["main_break_ending"], isNew: true },
  { key: "staff_pin_reset", label: "Staff PIN reset", when: "Staff PIN reset requested / done", channel: "bm_alert_staff_pin_v3", tone: "staff_pin_tone", kinds: ["staff_pin_reset"], isNew: true, audience: "management" },
  { key: "outage", label: "Outage raised", when: "Outage published", channel: "bm_support_outage_v5", tone: "outage_tone", kinds: ["incident"], event: "created" },
  { key: "outage_resolved", label: "Outage resolved", when: "Outage resolved", channel: "bm_support_outage_resolved_v5", tone: "outage_resolved_tone", kinds: ["incident"], event: "resolved" },
  { key: "app_update", label: "App / site update", when: "New BM Support update announced", channel: "bm_alert_app_update_v3", tone: "app_update_tone", kinds: ["app_update"], isNew: true },
  { key: "device_release", label: "New device release", when: "A watched streaming device is released", channel: "bm_alert_device_release_v3", tone: "device_release_tone", kinds: ["device_new_release"], isNew: true },
];

export const DEFAULT_PHONE_CHANNEL = "bm_support_alerts_v4";

export function phoneAlertFor(kind?: string, event?: string): PhoneAlert | undefined {
  if (!kind) return undefined;
  return PHONE_ALERTS.find((a) => a.kinds.includes(kind) && (!a.event || a.event === event));
}

/** Roles whose phones receive this alert for real. */
export function phoneAlertRoles(a: PhoneAlert): ("admin" | "management" | "staff" | "moderator")[] {
  return a.audience === "management" ? ["admin", "management"] : ["admin", "management", "staff", "moderator"];
}
