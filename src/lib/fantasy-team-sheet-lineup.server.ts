type Admin = { from: (table: string) => any };

type FantasyPlayer = {
  id: string;
  name: string;
};

function normaliseName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchPlayer(name: string, players: FantasyPlayer[]): FantasyPlayer | null {
  const wanted = normaliseName(name);
  if (!wanted) return null;
  const exact = players.find((player) => normaliseName(player.name) === wanted);
  if (exact) return exact;

  const bits = wanted.split(" ").filter(Boolean);
  const wantedSurname = bits.at(-1);
  if (!wantedSurname) return null;
  const surnameMatches = players.filter(
    (player) => normaliseName(player.name).split(" ").at(-1) === wantedSurname,
  );
  if (surnameMatches.length === 1) return surnameMatches[0] ?? null;
  if (surnameMatches.length === 0) return null;

  // Several squad members share the surname (Jones), so a bare surname on the
  // graphic is ambiguous. Only accept it when the first name or initial given
  // narrows it to exactly one player; otherwise leave it unmatched so the
  // caller refuses to act on a partial eleven.
  const wantedFirst = bits.length > 1 ? bits[0]! : "";
  if (!wantedFirst) return null;
  const narrowed = surnameMatches.filter((player) => {
    const first = normaliseName(player.name).split(" ")[0] ?? "";
    return first.startsWith(wantedFirst) || wantedFirst.startsWith(first);
  });
  return narrowed.length === 1 ? narrowed[0] ?? null : null;
}

/** Ask the reader for the eleven names. Returns the raw names exactly as read. */
async function readStarterNames(
  imageUrl: string,
  apiKey: string,
  instruction: string,
): Promise<string[] | null> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = payload.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { starters?: unknown };
    if (!Array.isArray(parsed.starters) || parsed.starters.length !== 11) return null;
    const names = parsed.starters.filter((n): n is string => typeof n === "string" && n.trim() !== "");
    return names.length === 11 ? names : null;
  } catch {
    return null;
  }
}

/** Surnames shared by more than one squad member — these always need a first name. */
function sharedSurnames(players: FantasyPlayer[]): Set<string> {
  const counts = new Map<string, number>();
  for (const player of players) {
    const surname = normaliseName(player.name).split(" ").at(-1);
    if (!surname) continue;
    counts.set(surname, (counts.get(surname) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([s]) => s));
}

/**
 * Turn read names into player ids. Any name whose surname is shared inside the
 * squad MUST carry a first name (or initial) that narrows it to one player —
 * otherwise the whole read is rejected rather than guessed at.
 */
function resolveIds(names: string[], players: FantasyPlayer[]): string[] | null {
  const ambiguous = sharedSurnames(players);
  const ids: string[] = [];
  for (const name of names) {
    const bits = normaliseName(name).split(" ").filter(Boolean);
    const surname = bits.at(-1);
    if (!surname) return null;
    if (ambiguous.has(surname) && bits.length < 2) return null; // first name missing
    const player = matchPlayer(name, players);
    if (!player) return null;
    ids.push(player.id);
  }
  const unique = [...new Set(ids)];
  return unique.length === 11 ? unique : null;
}

/** Read the starting XI from the official team-sheet graphic already captured for the fixture. */
export async function fetchTeamSheetStarterIds(
  admin: Admin,
  fixtureId: string,
  players: FantasyPlayer[],
): Promise<string[] | null> {
  const cacheKey = `fantasy_official_xi_${fixtureId}`;
  const { data: cached } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", cacheKey)
    .maybeSingle();
  const cachedIds = Array.isArray(cached?.value?.starterIds)
    ? cached.value.starterIds.filter((id: unknown): id is string => typeof id === "string")
    : [];
  // Only a complete eleven may be acted on. A partial read makes a real starter
  // look like he was left out, and he gets wrongly benched.
  if (cachedIds.length === 11) return cachedIds;

  const { data: sheet } = await admin
    .from("boro_team_sheets")
    .select("image_url")
    .eq("fixture_id", fixtureId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const imageUrl = typeof sheet?.image_url === "string" ? sheet.image_url : null;
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!imageUrl || !apiKey) return null;

  // First pass.
  const firstNames = await readStarterNames(
    imageUrl,
    apiKey,
    'Read this Middlesbrough team-sheet graphic. Return JSON only in the form {"starters":["First Last"]}. Give the player\'s FIRST NAME and SURNAME for every one of the exactly 11 players under STARTING — never a surname on its own. Exclude every substitute.',
  );
  const firstIds = firstNames ? resolveIds(firstNames, players) : null;
  if (!firstIds) return null;

  // Back-up pass: read the sheet again, independently, and only act when both
  // reads produce the very same eleven players. This is what stops a misread
  // shared surname (three Joneses in the squad) benching a real starter.
  const secondNames = await readStarterNames(
    imageUrl,
    apiKey,
    'Look at this Middlesbrough team sheet. List, as JSON only, {"starters":["First Last"]} — the 11 STARTING players in shirt-number order, each with first name then surname exactly as printed or as the recognised full name. Do not include substitutes and do not abbreviate to surnames.',
  );
  const secondIds = secondNames ? resolveIds(secondNames, players) : null;
  if (!secondIds) return null;

  const agree =
    firstIds.length === secondIds.length && firstIds.every((id) => secondIds.includes(id));
  if (!agree) return null;

  await admin.from("app_settings").upsert(
    {
      key: cacheKey,
      value: {
        starterIds: firstIds,
        extractedAt: new Date().toISOString(),
        verifiedBySecondRead: true,
      },
    },
    { onConflict: "key" },
  );
  return firstIds;
}