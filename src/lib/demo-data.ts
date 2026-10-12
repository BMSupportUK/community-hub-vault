/** Made-up records shown only to the demo account, never live data. */
const day = 86400000;
const ago = (d: number) => new Date(Date.now() - d * day).toISOString();

const p = (n: number, username: string, display_name: string, d: number) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  username,
  display_name,
  avatar_url: null,
  bio: null,
  created_at: ago(d),
  is_private: false,
  last_seen_at: ago(n % 3),
  equipped_nameplate_id: null,
});

export const DEMO_STAFF = [
  p(1, "sample-admin", "Sample Admin", 400),
  p(2, "sample-manager", "Sample Manager", 300),
  p(3, "sample-staff", "Sample Staff", 200),
  p(4, "sample-moderator", "Sample Moderator", 150),
];
export const DEMO_MEMBERS = [
  p(11, "demo-member-1", "Demo Member 1", 90),
  p(12, "demo-member-2", "Demo Member 2", 60),
  p(13, "demo-member-3", "Demo Member 3", 30),
  p(14, "demo-member-4", "Demo Member 4", 10),
];
export const DEMO_ROLES = [
  { user_id: DEMO_STAFF[0].id, role: "admin" },
  { user_id: DEMO_STAFF[1].id, role: "management" },
  { user_id: DEMO_STAFF[2].id, role: "staff" },
  { user_id: DEMO_STAFF[3].id, role: "moderator" },
  ...DEMO_MEMBERS.map((m) => ({ user_id: m.id, role: "subscriber" })),
];

export function demoTickets(userId: string) {
  const t = (n: number, subject: string, status: string, priority: string, d: number) => ({
    id: `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`,
    user_id: userId,
    category_id: null,
    subject,
    status,
    priority,
    assigned_to: DEMO_STAFF[2].id,
    created_at: ago(d),
    updated_at: ago(d / 2),
    closed_at: status === "closed" ? ago(d / 2) : null,
    order_id: null,
    archived_at: null,
  });
  return [
    t(1, "Sample: channel buffering", "open", "normal", 1),
    t(2, "Sample: help setting up my app", "in_progress", "high", 3),
    t(3, "Sample: forgot my login", "closed", "normal", 9),
  ];
}
export const DEMO_PROFILE_MAP: [string, { id: string; display_name: string; username: string }][] =
  DEMO_STAFF.map((s) => [s.id, { id: s.id, display_name: s.display_name, username: s.username }]);

export const DEMO_LATEST_ORDER = {
  id: "00000000-0000-4000-a000-000000000001",
  status: "paid",
  paid_at: ago(5),
  completed_at: null,
  created_at: ago(5),
  ticket_id: null,
};

export function demoReferrals() {
  const r = (n: number, used: boolean, paid: boolean, d: number) => ({
    id: `00000000-0000-4000-b000-${String(n).padStart(12, "0")}`,
    code: `DEMO${1000 + n}`,
    used_by: used ? DEMO_MEMBERS[n % DEMO_MEMBERS.length].id : null,
    used_at: used ? ago(d - 1) : null,
    created_at: ago(d),
    referral_bonus_paid: paid,
    joined_name: used ? DEMO_MEMBERS[n % DEMO_MEMBERS.length].display_name : null,
    joined_username: used ? DEMO_MEMBERS[n % DEMO_MEMBERS.length].username : null,
  });
  return [r(1, true, true, 40), r(2, true, false, 20), r(3, false, false, 5)];
}

/** Sample secure-order page content for /pay/demo. */
export const DEMO_CHECKOUT_VIEW = {
  order: {
    ref: "DEMO-0001",
    name: "Demo Customer",
    totalCents: 6000,
    discountCents: 0,
    paidAt: ago(5),
    completedAt: null,
    method: "wise",
    customerKind: "new" as const,
    createdAt: ago(5),
    email: null,
    status: "paid",
    paymentSentAt: ago(5),
    accountSetupStartedAt: ago(4),
    accountSetupAt: null,
  },
  items: [{ name: "Sample 12 month subscription", qty: 1, unitCents: 6000 }],
  invoice: null,
  bank: { account_name: "Sample Account", sort_code: "00-00-00", account_number: "00000000", iban: null, bic: null },
  qdCode: { label: "Sample DNS", code: "000000" },
};
