import type { CSSProperties } from "react";

// Simplified primary/secondary colors for clubs likely to feature in the
// Championship 2026/27 season. Pattern is one of:
//   "solid"   — body all primary
//   "stripes" — vertical stripes of primary + secondary
//   "halves"  — left primary, right secondary
//   "hoops"   — horizontal bands
// Sleeves use secondary unless overridden.
export type KitPattern = "solid" | "stripes" | "halves" | "hoops";
export type KitSpec = {
  primary: string;
  secondary: string;
  sleeve?: string;
  pattern?: KitPattern;
};

const KITS: Record<string, KitSpec> = {
  middlesbrough: { primary: "#d50032", secondary: "#ffffff", sleeve: "#ffffff" },
  sunderland: { primary: "#eb172b", secondary: "#ffffff", pattern: "stripes" },
  leeds: { primary: "#ffffff", secondary: "#1d4ed8", sleeve: "#1d4ed8" },
  "leeds united": { primary: "#ffffff", secondary: "#1d4ed8", sleeve: "#1d4ed8" },
  norwich: { primary: "#fff200", secondary: "#00a650", sleeve: "#00a650" },
  "norwich city": { primary: "#fff200", secondary: "#00a650", sleeve: "#00a650" },
  "sheffield wednesday": { primary: "#1d4ed8", secondary: "#ffffff", pattern: "stripes" },
  hull: { primary: "#f5a623", secondary: "#111111", pattern: "stripes" },
  "hull city": { primary: "#f5a623", secondary: "#111111", pattern: "stripes" },
  cardiff: { primary: "#0070b5", secondary: "#0070b5", sleeve: "#ffffff" },
  "cardiff city": { primary: "#0070b5", secondary: "#0070b5", sleeve: "#ffffff" },
  "bristol city": { primary: "#e21c2a", secondary: "#ffffff", sleeve: "#ffffff" },
  swansea: { primary: "#ffffff", secondary: "#111111", sleeve: "#111111" },
  "swansea city": { primary: "#ffffff", secondary: "#111111", sleeve: "#111111" },
  stoke: { primary: "#e21c2a", secondary: "#ffffff", pattern: "stripes" },
  "stoke city": { primary: "#e21c2a", secondary: "#ffffff", pattern: "stripes" },
  preston: { primary: "#ffffff", secondary: "#16243e", sleeve: "#16243e" },
  "preston north end": { primary: "#ffffff", secondary: "#16243e", sleeve: "#16243e" },
  watford: { primary: "#fbee23", secondary: "#000000", sleeve: "#e21c2a" },
  qpr: { primary: "#1d4ed8", secondary: "#ffffff", pattern: "hoops" },
  "queens park rangers": { primary: "#1d4ed8", secondary: "#ffffff", pattern: "hoops" },
  millwall: { primary: "#0033a0", secondary: "#0033a0", sleeve: "#ffffff" },
  coventry: { primary: "#7ec9eb", secondary: "#0a2a66", sleeve: "#0a2a66" },
  "coventry city": { primary: "#7ec9eb", secondary: "#0a2a66", sleeve: "#0a2a66" },
  blackburn: { primary: "#ffffff", secondary: "#1d4ed8", pattern: "halves" },
  "blackburn rovers": { primary: "#ffffff", secondary: "#1d4ed8", pattern: "halves" },
  plymouth: { primary: "#005f3f", secondary: "#ffffff", sleeve: "#ffffff" },
  "plymouth argyle": { primary: "#005f3f", secondary: "#ffffff", sleeve: "#ffffff" },
  derby: { primary: "#ffffff", secondary: "#111111", sleeve: "#111111" },
  "derby county": { primary: "#ffffff", secondary: "#111111", sleeve: "#111111" },
  birmingham: { primary: "#0050a0", secondary: "#ffffff", sleeve: "#ffffff" },
  "birmingham city": { primary: "#0050a0", secondary: "#ffffff", sleeve: "#ffffff" },
  portsmouth: { primary: "#003c96", secondary: "#ffffff", sleeve: "#ffffff" },
  "west bromwich albion": { primary: "#122f67", secondary: "#ffffff", pattern: "stripes" },
  "west brom": { primary: "#122f67", secondary: "#ffffff", pattern: "stripes" },
  "sheffield united": { primary: "#e21c2a", secondary: "#ffffff", pattern: "stripes" },
  oxford: { primary: "#fbee23", secondary: "#0a2a66", sleeve: "#0a2a66" },
  "oxford united": { primary: "#fbee23", secondary: "#0a2a66", sleeve: "#0a2a66" },
  charlton: { primary: "#e21c2a", secondary: "#ffffff", sleeve: "#ffffff" },
  "charlton athletic": { primary: "#e21c2a", secondary: "#ffffff", sleeve: "#ffffff" },
  wrexham: { primary: "#e21c2a", secondary: "#ffffff", sleeve: "#ffffff" },
  ipswich: { primary: "#1656a8", secondary: "#ffffff", sleeve: "#ffffff" },
  "ipswich town": { primary: "#1656a8", secondary: "#ffffff", sleeve: "#ffffff" },
  southampton: { primary: "#ffffff", secondary: "#d71a23", pattern: "stripes" },
  "lincoln city": { primary: "#e21c2a", secondary: "#ffffff", pattern: "stripes" },
};

const DEFAULT_KIT: KitSpec = { primary: "#94a3b8", secondary: "#475569", sleeve: "#475569" };

function normaliseTeam(name: string) {
  return name
    .toLowerCase()
    .replace(/\bfc\b|\bf\.c\.\b|\bafc\b/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lookupKit(team: string): KitSpec {
  const n = normaliseTeam(team);
  if (KITS[n]) return KITS[n];
  // Try removing common suffixes/prefixes to match shorter map keys.
  const stripped = n.replace(/\b(city|united|town|county|athletic|rovers|albion|wanderers|north end|argyle)\b/g, "").trim();
  if (stripped && KITS[stripped]) return KITS[stripped];
  // Try first word match.
  const first = n.split(" ")[0];
  if (first && KITS[first]) return KITS[first];
  return DEFAULT_KIT;
}

export function TeamKit({ team, size = 22, className }: { team: string; size?: number; className?: string }) {
  const kit = lookupKit(team);
  const sleeve = kit.sleeve ?? kit.secondary;
  const pattern = kit.pattern ?? "solid";
  const style: CSSProperties = { width: size, height: size };

  return (
    <svg
      viewBox="0 0 24 24"
      style={style}
      className={className}
      aria-hidden
      role="img"
    >
      {/* sleeves */}
      <path d="M2 6 L7 3 L9 7 L5 10 Z" fill={sleeve} stroke="#0008" strokeWidth="0.4" />
      <path d="M22 6 L17 3 L15 7 L19 10 Z" fill={sleeve} stroke="#0008" strokeWidth="0.4" />
      {/* body */}
      <path
        d="M7 3 L10 4 Q12 5.2 14 4 L17 3 L19 10 L19 21 L5 21 L5 10 Z"
        fill={kit.primary}
        stroke="#0008"
        strokeWidth="0.4"
      />
      {pattern === "stripes" && (
        <g>
          <rect x="7" y="4.2" width="1.8" height="17" fill={kit.secondary} />
          <rect x="10.6" y="4.2" width="1.8" height="17" fill={kit.secondary} />
          <rect x="14.2" y="4.2" width="1.8" height="17" fill={kit.secondary} />
        </g>
      )}
      {pattern === "halves" && (
        <path d="M12 4 Q11 5 11 5 L11 21 L19 21 L19 10 L17 3 L14 4 Q13 4.5 12 4 Z" fill={kit.secondary} />
      )}
      {pattern === "hoops" && (
        <g>
          <rect x="5" y="7" width="14" height="2" fill={kit.secondary} />
          <rect x="5" y="12" width="14" height="2" fill={kit.secondary} />
          <rect x="5" y="17" width="14" height="2" fill={kit.secondary} />
        </g>
      )}
      {/* collar */}
      <path d="M10 4 Q12 6 14 4 L13 6 Q12 6.6 11 6 Z" fill="#0006" />
    </svg>
  );
}