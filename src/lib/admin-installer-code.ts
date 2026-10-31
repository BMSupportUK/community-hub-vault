import { z } from "zod";
import { ADMIN_ISSUE_TTL_MS } from "./enabler-handoff";
import { DIRECT_PIN_TTL_MS } from "./direct-install";

export const adminInstallerCodeSchema = z.object({
  name: z.string().trim().min(1, "Type the person's reference name.").max(120),
  device: z.enum(["amazon", "android"]),
  purpose: z.enum(["install", "support"]),
  installer: z.enum(["direct", "enabler"]).default("enabler"),
  appPaths: z.array(z.string().regex(/^\/api\/public\/tv-install-apk\/[0-9a-f-]{36}$/)).max(40),
}).superRefine((data, ctx) => {
  if (data.purpose === "install" && !data.appPaths.length) ctx.addIssue({ code: "custom", path: ["appPaths"], message: "Tick at least one app to install." });
  if (data.installer === "direct" && data.purpose !== "install") ctx.addIssue({ code: "custom", path: ["purpose"], message: "BM Direct Install only installs apps." });
});

export function adminInstallerPinTtl(installer: "direct" | "enabler") {
  return installer === "direct" ? DIRECT_PIN_TTL_MS : ADMIN_ISSUE_TTL_MS;
}

export async function requireAdminInstallerAccess(sb: { rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" | "management" }) => PromiseLike<{ data: boolean | null; error?: unknown }> }, userId: string) {
  const roles = await Promise.all([sb.rpc("has_role", { _user_id: userId, _role: "admin" }), sb.rpc("has_role", { _user_id: userId, _role: "management" })]);
  if (!roles.some((r) => !r.error && r.data === true)) throw new Error("Only admin and management can issue codes.");
}