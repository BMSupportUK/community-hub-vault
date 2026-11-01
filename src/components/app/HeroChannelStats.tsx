import { Users, Video } from "lucide-react";

interface HeroChannelStatsProps {
  subscribers?: number | null;
  videos?: number | null;
}

const countFormatter = new Intl.NumberFormat("en-GB");

export function HeroChannelStats({ subscribers = null, videos = null }: HeroChannelStatsProps) {
  const stats = [
    { label: "Subscribers", value: subscribers, Icon: Users },
    { label: "Videos", value: videos, Icon: Video },
  ];

  return (
    <aside
      aria-label="Channel statistics"
      className="absolute inset-y-0 right-0 z-10 flex w-24 flex-col justify-center gap-6 border-l border-border bg-background/90 px-2 py-4 text-foreground backdrop-blur-md sm:w-28 sm:gap-8"
    >
      {stats.map(({ label, value, Icon }) => (
        <div key={label} className="flex min-w-0 flex-col items-center gap-2" title={value === null ? `${label}: not available yet` : label}>
          <div className="flex h-8 w-full items-center justify-center gap-2">
            <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 text-base font-bold tabular-nums" aria-label={value === null ? `${label} unavailable` : `${countFormatter.format(value)} ${label.toLowerCase()}`}>
              {value === null ? "—" : countFormatter.format(value)}
            </span>
          </div>
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
      ))}
    </aside>
  );
}