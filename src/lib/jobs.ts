import { z } from "zod";

export const jobZoneSchema = z.enum(["bm", "fanzone"]);
export type JobZone = z.infer<typeof jobZoneSchema>;
export const jobStatusSchema = z.enum(["new", "reviewing", "shortlisted", "accepted", "rejected"]);
export const vacancySchema = z.object({
  id: z.string().uuid().optional(), zone: jobZoneSchema,
  title: z.string().trim().min(1).max(150), location: z.string().trim().max(200),
  employment_type: z.string().trim().max(100), description: z.string().trim().min(1).max(12000),
  requirements: z.string().trim().max(12000), closing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  published: z.boolean(),
  positions_available: z.number().int().min(1).max(100).default(1),
});
export const applicationSchema = z.object({
  vacancy_id: z.string().uuid(), zone: jobZoneSchema,
  full_name: z.string().trim().min(1).max(150), email: z.string().trim().email().max(254),
  phone: z.string().trim().max(50), experience: z.string().trim().min(1).max(6000),
  motivation: z.string().trim().min(1).max(6000), availability: z.string().trim().min(1).max(1000),
  consent: z.literal(true), website: z.string().max(0).default(""),
});
export type VacancyInput = z.infer<typeof vacancySchema>;
export type JobVacancy = VacancyInput & { id: string; created_at: string; positions_filled?: number };
export type JobApplication = Omit<z.infer<typeof applicationSchema>, "website" | "zone"> & {
  id: string; status: z.infer<typeof jobStatusSchema>; admin_notes: string; created_at: string; access_token: string;
};
export function vacanciesForZone(rows: JobVacancy[], zone: JobZone) { return rows.filter((row) => row.zone === zone); }
export function jobAdminAllowed(roles: readonly string[]) { return roles.includes("admin"); }
export function jobsHead(zone: JobZone, admin = false) {
  const name = zone === "bm" ? "BM Support" : "Boro Fan Zone";
  const title = `${admin ? "Recruitment administration" : "Staff vacancies"} | ${name}`;
  const description = admin ? `Manage ${name} staff positions and privately review job applications.` : `Browse ${name} staff opportunities and apply to join the team.`;
  return { meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] };
}export const jobMessageSchema = z.string().trim().min(1).max(4000);
export type JobChatMessage = { id: string; sender: "admin" | "applicant"; body: string; created_at: string };
export type JobApplicationView = { id: string; full_name: string; email: string; phone: string; experience: string; motivation: string; availability: string; status: string; created_at: string; vacancy_title: string; zone: JobZone; messages: JobChatMessage[] };
export function positionsLabel(n: number | null | undefined) { const c = n && n > 0 ? n : 1; return c === 1 ? "1 position" : `${c} positions`; }
export function positionsLeft(available: number | null | undefined, filled: number | null | undefined) { return Math.max(0, (available && available > 0 ? available : 1) - (filled ?? 0)); }
