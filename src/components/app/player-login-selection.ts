export type SavedPlayerLogin = {
  id: string;
  app_login_name: string;
  password: string;
  expiry_at: string | null;
  account_type: string | null;
  account_number: number;
};

export function selectedPlayerLogin(accounts: SavedPlayerLogin[], selectedId: string | null) {
  const account = accounts.find((item) => item.id === selectedId);
  if (!account?.app_login_name.trim() || !account.password) return null;
  return { username: account.app_login_name, password: account.password };
}