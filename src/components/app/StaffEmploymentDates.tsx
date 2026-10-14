import { employmentDate } from "@/lib/staff-employment";
export function StaffEmploymentDates({ joined, left }: { joined?: string | null; left?: string | null }) {
  return <dl className="grid grid-cols-2 gap-3 text-xs">
    <div><dt className="text-muted-foreground">Date joined</dt><dd className="mt-1 font-medium">{employmentDate(joined)}</dd></div>
    <div><dt className="text-muted-foreground">Date left</dt><dd className="mt-1 font-medium">{left ? employmentDate(left) : "—"}</dd></div>
  </dl>;
}