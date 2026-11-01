type DemoName = { app_name: string | null; title: string };

function demoKey(value: string | null | undefined): string {
  const name = (value ?? "").toLowerCase().replace(/\.apk$/, "")
    .replace(/\b(?:official|offical|service|3rd|third|party|rebrand|rebranded|app)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (/^(?:bm)?(?:xc|xctv)$/.test(name)) return "xctv";
  if (/^(?:bm)?smart(?:player)?(?:v?\d+)?$/.test(name)) return "smartplayer";
  return name;
}

/** Match current install labels to existing Store demos without changing either record. */
export function findAppDemo<T extends DemoName>(name: string, demos: T[]): T | undefined {
  const key = demoKey(name);
  if (!key) return undefined;
  const keys = (demo: T) => [demoKey(demo.app_name), demoKey(demo.title)].filter(Boolean);
  return demos.find((demo) => keys(demo).includes(key))
    ?? demos.find((demo) => keys(demo).some((candidate) => candidate.includes(key) || key.includes(candidate)));
}