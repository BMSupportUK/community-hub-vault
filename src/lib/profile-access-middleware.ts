import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { customerActionAllowed } from "./profile-access";

/** Server metadata is supplied by Start, never accepted from the browser. */
export const enforceProfileActions = createMiddleware({ type: "function" })
  .server(async ({ next, serverFnMeta }) => {
    const bearer = getRequestHeader("authorization");
    if (!bearer?.startsWith("Bearer ")) return next();
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Unable to verify profile permissions.");
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: bearer } } });
    const { data, error } = await client.rpc("customer_profile_restricted");
    if (error) throw new Error("Unable to verify profile permissions.");
    if (data && !customerActionAllowed(serverFnMeta.name)) throw new Error("This action requires your staff profile and account password.");
    return next();
  });