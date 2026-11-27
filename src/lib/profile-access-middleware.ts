import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { customerActionAllowed } from "./profile-access";
import { mfaAccessState, mfaRecoveryActionAllowed } from "./mfa-access";
import { applicationAccessSchema, applicationActionAllowed } from "./application-access-policy";

/** Server metadata is supplied by Start, never accepted from the browser. */
export const enforceProfileActions = createMiddleware({ type: "function" })
  .server(async ({ next, serverFnMeta }) => {
    const bearer = getRequestHeader("authorization");
    if (!bearer?.startsWith("Bearer ")) return next();
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Unable to verify profile permissions.");
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: bearer } } });
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel(bearer.slice(7));
    const mfaAccess = mfaAccessState(assurance.data?.currentLevel, assurance.data?.nextLevel, assurance.error);
    if (mfaAccess === "error") throw new Error("Unable to verify two-factor authentication.");
    if (mfaAccess === "challenge" && !mfaRecoveryActionAllowed(serverFnMeta.name)) throw new Error("Complete two-factor authentication before continuing.");
    const { data, error } = await client.rpc("customer_profile_restricted");
    if (error) throw new Error("Unable to verify profile permissions.");
    if (data && !customerActionAllowed(serverFnMeta.name)) throw new Error("This action requires your staff profile and account password.");
    const { data: locks, error: lockError } = await client.rpc("application_access_status");
    if (lockError || !applicationActionAllowed(applicationAccessSchema.parse(locks), serverFnMeta.name)) throw new Error("Unlock the required screen or portal before continuing.");
    return next();
  });