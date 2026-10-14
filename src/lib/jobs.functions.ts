import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applicationSchema, jobZoneSchema, vacancySchema, jobStatusSchema, type JobVacancy, type JobApplication } from "./jobs";

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
    const result = await publicClient.from("staff_job_vacancies").select("id,zone,title,location,employment_type,description,requirements,closing_date,published,created_at").eq("zone", data.zone).order("created_at", { ascending: false });
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
    const result = await client.rpc("submit_staff_job_application", { _vacancy_id: data.vacancy_id, _zone: data.zone, _full_name: data.full_name, _email: data.email, _phone: data.phone, _experience: data.experience, _motivation: data.motivation, _availability: data.availability, _consent: data.consent });
    if (result.error) throw new Error("Your application could not be sent. Check the position is still open and try again.");
    return { id: result.data };
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