export function formatRoleLabel(role: string | null | undefined): string {
  if (!role) return "";
  return role
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}