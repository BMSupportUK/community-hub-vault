export function formatRoleLabel(role: string | null | undefined): string {
  if (!role) return "";
  if (role === "admin") return "Owner";
  if (role === "nonsubscriber") return "Expired Subscription";
  if (role === "subscriber") return "Subscriber";
  return role
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}