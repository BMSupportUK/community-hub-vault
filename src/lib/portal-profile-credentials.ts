export type SavedProfileLogin = {
  id: string;
  app_login_name: string | null;
  password: string | null;
  expiry_at: string | null;
  account_type: string | null;
};

/** Exact verified profile only; never match by email, old order name or first row. */
export function portalProfileCredentials(rows: SavedProfileLogin[], profileId: string | null) {
  const selected = profileId ? rows.find((row) => row.id === profileId) : null;
  return selected ? [{
    id: selected.id,
    login: selected.app_login_name,
    password: selected.password,
    expiresAt: selected.expiry_at,
    accountType: selected.account_type ?? "single",
  }] : [];
}