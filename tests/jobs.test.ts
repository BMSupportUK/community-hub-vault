import { expect, test } from 'bun:test';
import { vacanciesForZone, jobAdminAllowed, applicationSchema, type JobVacancy } from '../src/lib/jobs';
const jobs: JobVacancy[] = ['bm', 'fanzone'].map((zone, i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, zone: zone as 'bm' | 'fanzone', title: 'Staff role', location: '', employment_type: '', description: 'Team role', requirements: '', closing_date: null, published: true, created_at: '2026-10-14T12:00:00Z' }));
test('BM Support jobs board contains only BM Support positions', () => { expect(vacanciesForZone(jobs, 'bm').map((j) => j.zone)).toEqual(['bm']); });
test('Boro Fan Zone jobs board contains only Fan Zone positions', () => { expect(vacanciesForZone(jobs, 'fanzone').map((j) => j.zone)).toEqual(['fanzone']); });
test('job applications can only be reviewed by admin', () => { expect(jobAdminAllowed(['admin'])).toBe(true); for (const role of ['management', 'staff', 'subscriber', 'boro_fan_zone_moderator', 'boro_fan_zone_member']) expect(jobAdminAllowed([role])).toBe(false); });
test('applications require consent and complete contact details', () => {
 const application = { vacancy_id: jobs[0].id, zone: 'bm', full_name: 'Applicant', email: 'applicant@example.com', phone: '', experience: 'Customer support', motivation: 'Help people', availability: 'Weekdays', consent: true, website: '' };
 expect(applicationSchema.safeParse(application).success).toBe(true);
 expect(applicationSchema.safeParse({ ...application, consent: false }).success).toBe(false);
 expect(applicationSchema.safeParse({ ...application, email: 'invalid' }).success).toBe(false);
});
import { vacancySchema, positionsLabel } from '../src/lib/jobs';
test('a position can advertise multiple openings (1-100)', () => {
 const base = { zone: 'bm', title: 'Support', location: '', employment_type: '', description: 'x', requirements: '', closing_date: null, published: true };
 expect(vacancySchema.parse(base).positions_available).toBe(1);
 expect(vacancySchema.parse({ ...base, positions_available: 3 }).positions_available).toBe(3);
 expect(vacancySchema.safeParse({ ...base, positions_available: 0 }).success).toBe(false);
 expect(positionsLabel(3)).toBe('3 positions');
});
import { positionsLeft } from '../src/lib/jobs';
test('accepted applicants reduce the roles left to fill', () => {
 expect(positionsLeft(3, 0)).toBe(3);
 expect(positionsLeft(3, 2)).toBe(1);
 expect(positionsLeft(3, 3)).toBe(0);
 expect(positionsLeft(3, 5)).toBe(0);
});

describe("jobZoneViewerAllowed", () => {
  it("allows admin for both zones", () => {
    expect(jobZoneViewerAllowed(["admin"], "bm")).toBe(true);
    expect(jobZoneViewerAllowed(["admin"], "fanzone")).toBe(true);
  });
  it("allows management for BM Support only", () => {
    expect(jobZoneViewerAllowed(["management"], "bm")).toBe(true);
    expect(jobZoneViewerAllowed(["management"], "fanzone")).toBe(false);
  });
  it("denies staff and members", () => {
    expect(jobZoneViewerAllowed(["staff"], "bm")).toBe(false);
    expect(jobZoneViewerAllowed([], "bm")).toBe(false);
  });
});
