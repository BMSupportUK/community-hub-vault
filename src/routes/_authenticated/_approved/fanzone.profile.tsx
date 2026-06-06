import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { FanZoneAliasSettings } from "@/components/app/FanZoneAliasSettings";

export const Route = createFileRoute("/_authenticated/_approved/fanzone/profile")({
  component: FanZoneProfilePage,
});

function FanZoneProfilePage() {
  return (
    <div className="boro-theme w-full px-4 sm:px-6 lg:px-10 py-6 max-w-3xl mx-auto">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-black text-white drop-shadow">Edit Fan Zone profile</h1>
        <Button asChild size="sm" variant="ghost">
          <Link to="/forum">← Back to forum</Link>
        </Button>
      </div>
      <FanZoneAliasSettings />
    </div>
  );
}