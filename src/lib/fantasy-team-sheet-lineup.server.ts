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
              {
                type: "text",
                text: "Read this Middlesbrough team-sheet graphic. Return JSON only in the form {\"starters\":[\"Full Name\"]}. Include exactly the 11 players under STARTING and exclude every substitute.",
              },
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

    const ids = parsed.starters
      .map((name) => (typeof name === "string" ? matchPlayer(name, players)?.id : undefined))
      .filter((id): id is string => typeof id === "string");
    const uniqueIds = [...new Set(ids)];
    // All eleven names must map to a squad player. Anything less is a bad read:
    // never cache it and never swap from it.
    if (uniqueIds.length !== 11) return null;

    await admin.from("app_settings").upsert(
      { key: cacheKey, value: { starterIds: uniqueIds, extractedAt: new Date().toISOString() } },
      { onConflict: "key" },
    );
    return uniqueIds;
  } catch {
    return null;
  }
}