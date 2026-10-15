import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { jobMessageSchema, type JobApplicationView, applicationSchema, jobZoneSchema, vacancySchema, jobStatusSchema, type JobVacancy, type JobApplication } from "./jobs";

export const listJobVacancies = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ zone: jobZoneSchema }).parse(input))
  .handler(async ({ data }) => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const publicClient = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key); return fetch(input, { ...init, headers });
      } },
    });
    const result = await publicClient.from("staff_job_vacancies").select("id,zone,title,location,employment_type,description,requirements,closing_date,published,positions_available,positions_filled,created_at").eq("zone", data.zone).order("created_at", { ascending: false });
    if (result.error) throw new Error("Positions could not be loaded. Please try again.");
    return result.data as JobVacancy[];
  });

export const submitJobApplication = createServerFn({ method: "POST" })
  .inputValidator((input) => applicationSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key); return fetch(input, { ...init, headers });
      } },
    });
    const result = await client.rpc("submit_staff_job_application_v3", { _vacancy_id: data.vacancy_id, _zone: data.zone, _full_name: data.full_name, _email: data.email, _phone: data.phone, _experience: data.experience, _motivation: data.motivation, _availability: data.availability, _consent: data.consent });
    if (result.error) throw new Error("Your application could not be sent. Check the position is still open and try again.");
    const out = result.data as unknown as { token: string; password: string; id: string };
    const v = await client.from("staff_job_vacancies").select("title").eq("id", data.vacancy_id).maybeSingle();
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendAndLogEmail } = await import("@/lib/email-templates/send-and-log");
      const origin = process.env.PUBLIC_SITE_URL || "https://bmsupport.uk";
      await sendAndLogEmail(supabaseAdmin, "job-application-received", data.email, {
        templateData: { applicantName: data.full_name, positionTitle: v.data?.title ?? "", siteName: data.zone === "bm" ? "BM Support" : "Boro Fan Zone", applicationLink: `${origin}/job-application/${out.token}`, applicationPassword: out.password },
        idempotencyKey: `job-application-received-${out.id}`,
      });
    } catch (e) { console.error("job application email failed", e); }
    return { token: out.token, password: out.password };
  });

export const getJobAdminData = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ zone: jobZoneSchema }).parse(input))
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (role.error || !role.data) throw new Error("Admin access required.");
    const vacancies = await context.supabase.from("staff_job_vacancies").select("*").eq("zone", data.zone).order("created_at", { ascending: false });
    if (vacancies.error) throw new Error("Positions could not be loaded.");
    const ids = vacancies.data.map((v) => v.id);
    if (!ids.length) return { vacancies: [] as JobVacancy[], applications: [] as JobApplication[] };
    const applications = await context.supabase.from("staff_job_applications").select("*").in("vacancy_id", ids).order("created_at", { ascending: false });
    if (applications.error) throw new Error("Applications could not be loaded.");
    return { vacancies: vacancies.data as JobVacancy[], applications: applications.data as JobApplication[] };
  });

export const saveJobVacancy = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => vacancySchema.parse(input))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (role.error || !role.data) throw new Error("Admin access required.");
    const { id, ...fields } = data;
    const result = id
      ? await context.supabase.from("staff_job_vacancies").update(fields).eq("id", id).eq("zone", data.zone).select("id").single()
      : await context.supabase.from("staff_job_vacancies").insert(fields).select("id").single();
    if (result.error) throw new Error("The position could not be saved.");
    return result.data;
  });

export const reviewJobApplication = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), status: jobStatusSchema, admin_notes: z.string().trim().max(6000) }).parse(input))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (role.error || !role.data) throw new Error("Admin access required.");
    const result = await context.supabase.from("staff_job_applications").update({ status: data.status, admin_notes: data.admin_notes }).eq("id", data.id).select("id").single();
    if (result.error) throw new Error("The application could not be updated.");
    return result.data;
  });
function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key); return fetch(input, { ...init, headers });
    } },
  });
}
const tokenSchema = z.string().regex(/^[a-f0-9]{40,128}$/);

export const getApplicationByToken = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ token: tokenSchema, password: z.string().trim().min(1).max(40) }).parse(input))
  .handler(async ({ data }) => {
    const r = await publicClient().rpc("get_job_application_secure", { _token: data.token, _password: data.password });
    if (r.error) throw new Error("Your application could not be loaded.");
    return (r.data ?? null) as unknown as JobApplicationView | null;
  });

export const postApplicantMessage = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: tokenSchema, password: z.string().trim().min(1).max(40), body: jobMessageSchema }).parse(input))
  .handler(async ({ data }) => {
    const r = await publicClient().rpc("post_job_application_message_secure", { _token: data.token, _password: data.password, _body: data.body });
    if (r.error) throw new Error("Your message could not be sent.");
    return { id: r.data };
  });

export const getApplicationAdmin = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (role.error || !role.data) throw new Error("Admin access required.");
    const a = await context.supabase.from("staff_job_applications").select("*").eq("id", data.id).maybeSingle();
    if (a.error || !a.data) throw new Error("Application not found.");
    const [v, m] = await Promise.all([
      context.supabase.from("staff_job_vacancies").select("title,zone").eq("id", a.data.vacancy_id).maybeSingle(),
      context.supabase.from("staff_job_application_messages").select("id,sender,body,created_at").eq("application_id", data.id).order("created_at"),
    ]);
    if (m.error) throw new Error("Messages could not be loaded.");
    return { application: a.data as unknown as JobApplication, vacancy_title: v.data?.title ?? "", zone: (v.data?.zone ?? "bm") as "bm" | "fanzone", messages: m.data as JobApplicationView["messages"] };
  });

export const postAdminApplicationMessage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), body: jobMessageSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const r = await context.supabase.from("staff_job_application_messages").insert({ application_id: data.id, sender: "admin", body: data.body }).select("id").single();
    if (r.error) throw new Error("Your message could not be sent.");
    return r.data;
  });

export const resetApplicationPassword = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const r = await context.supabase.rpc("reset_job_application_password", { _id: data.id });
    if (r.error) throw new Error("The password could not be reset.");
    return { password: r.data as string };
  });
