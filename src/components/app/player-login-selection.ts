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

/** Typed-in login, used when the subscriber has nothing saved on their account. */
export function manualPlayerLogin(username: string, password: string) {
  const name = username.trim();
  if (!name || !password) return null;
  return { username: name, password };
}

/** Explicit credential ownership wins; legacy devices match the stored provider login. */
export function devicesForPlayerLogin<T extends { credential_id: string | null; iptv_username: string | null }>(devices: T[], account: SavedPlayerLogin) {
  return devices.filter((device) => device.credential_id
    ? device.credential_id === account.id
    : Boolean(account.app_login_name.trim()) && device.iptv_username?.trim() === account.app_login_name.trim());
}
