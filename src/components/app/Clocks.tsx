import { useEffect, useState } from "react";

function format(tz: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: tz,
  }).format(new Date());
}

function abbrev(tz: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    timeZoneName: "short",
  }).formatToParts(new Date());
  return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
}

export function Clocks() {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const userTz =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const ukTz = "Europe/London"; // auto handles BST / GMT
  const sameAsUk = userTz === ukTz;

  return (
    <div className="flex items-center gap-2">
      <ClockPill
        time={format(ukTz)}
        label={abbrev(ukTz)}
        ring="ring-amber-400/60"
        text="text-amber-300"
        labelBg="bg-amber-500/20 text-amber-200"
      />
      {!sameAsUk && (
        <ClockPill
          time={format(userTz)}
          label={abbrev(userTz)}
          ring="ring-sky-400/60"
          text="text-sky-300"
          labelBg="bg-sky-500/20 text-sky-200"
        />
      )}
    </div>
  );
}

function ClockPill({
  time,
  label,
  ring,
  text,
  labelBg,
}: {
  time: string;
  label: string;
  ring: string;
  text: string;
  labelBg: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full bg-rail/80 ring-1 ${ring} px-3 py-1 font-mono text-sm tabular-nums shadow-soft`}
    >
      <span className={text}>{time}</span>
      <span
        className={`text-[10px] uppercase tracking-wider rounded-full px-1.5 py-0.5 ${labelBg}`}
      >
        {label}
      </span>
    </div>
  );
}