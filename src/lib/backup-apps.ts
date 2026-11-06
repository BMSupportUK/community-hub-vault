/** Recognise the existing QD and XC/XCTV install labels without changing build records. */
export function isBackupApp(app: { appName?: string | null; fileName?: string | null }): boolean {
  const name = (app.appName ?? "").toLowerCase().replace(/\b(?:official|offical|service|3rd|third|party|rebrand|rebranded|app)\b/g, "").replace(/[^a-z0-9]/g, "");
  return /^(?:bm)?(?:qd|xc|xctv)$/.test(name);
}