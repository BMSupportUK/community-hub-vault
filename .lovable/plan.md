## Goal
Restyle the auto-generated time pills on the sports guide read page to match the chosen "Event Schedule" mockup — card-style rows with a muted **source GMT pill first**, then the bold **fuchsia local-time pill**, alongside the event name. No event thumbnails.

## Scope
Frontend only. Edit `src/lib/parse-event-times.ts` — the existing `annotateTimesInEl` function already injects the two pills inline next to each detected time. No route or schema changes.

## Changes

### 1. Reorder the pills
In `annotateTimesInEl`, swap the append order so the **source pill** (GMT, muted) is inserted first, followed by a thin divider, then the **converted pill** (viewer local time, fuchsia). Today it's local-time → divider → source.

### 2. Restyle pills to match the mockup
- **Source pill (GMT, secondary):** `bg-white/5 border border-white/10 text-purple-100/70 px-3 py-1 rounded-lg text-xs font-semibold`
- **Local-time pill (primary):** `bg-fuchsia-600 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-[0_0_15px_rgba(192,38,211,0.25)]`
- Inside each pill, render the time prominently and the timezone label (`GMT`, `GMT+14`, etc.) in a smaller, lower-opacity span — same two-tier weight as the mockup.
- Drop the `|` divider; use spacing (`gap-2`) instead.

### 3. Keep the date prefix tidy
The full "Saturday, 23 May 2026" prefix is already added. Keep it as the leading text inside each pill so each row reads:
`Saturday, 23 May 2026 00:00 GMT` → `Saturday, 23 May 2026 14:00 GMT+14`

No thumbnails, no extra event-icon work — the existing row text (event name) stays exactly as the guide author wrote it.

## Out of scope
- Editing the guide body itself / adding category icons
- Changing the numbered list markers (those come from the guide HTML)
- Card backgrounds for whole rows (the guide body controls row layout)
