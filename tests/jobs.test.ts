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
