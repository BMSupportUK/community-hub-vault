## Goal
A new approved-members-only page `/streaming-devices` listing curated sideload-capable streaming devices, split into **High spec** and **Medium spec** tiers. Each card has a **Best price on Amazon** button. Prices auto-refresh weekly via Firecrawl.

## Confirmed decisions
- Tiers: **High** and **Medium**.
- Best price: **Plain Amazon UK link** (no affiliate tag — can be added later by editing one helper).
- Access: **Approved members only** (`_authenticated/_approved`).
- Updates: **Weekly Firecrawl scrape** + on-demand "Refresh now" for admins.
- Sideload exclusion: enforced by curation (only sideload-capable devices added to the catalogue).

## Data model

**`streaming_devices`** (admin-managed)
- `name`, `brand`, `tier` (`high` | `medium`), `image_url`, `summary`, `specs` (jsonb: cpu, ram, storage, resolution, hdr, wifi, ethernet, remote, os), `sideload_notes`, `amazon_url`, `sort_order`, `is_active`.

**`streaming_device_prices`** (latest scraped price)
- `device_id`, `price_cents`, `currency` (`GBP`), `availability`, `scraped_at`, `source_url`.

RLS / GRANTs:
- `SELECT` for `authenticated`; mutations restricted to admins via `has_role`.
- `service_role` full access (used by the cron route).

## Pages

### `/streaming-devices` (new, approved-only)
- Two sections: **High spec**, then **Medium spec**.
- Card: image, name + brand, key specs as chips (CPU, RAM, storage, max res, HDR), short summary, sideload note, "Updated X days ago" pill, primary **Best price on Amazon — £XX.XX** button (new tab, `rel="sponsored noopener noreferrer"`). If no recent price, button shows "View on Amazon".

### `/admin-streaming-devices` (new, admin-only)
- CRUD table for devices (name, brand, tier, image URL, Amazon URL, specs form, sideload notes, sort order, active toggle).
- "Refresh prices now" button.

Both pages wired into existing admin/nav surfaces.

## Weekly price refresh
- **Server route** `src/routes/api/public/hooks/refresh-streaming-prices.ts`: iterates active devices, calls Firecrawl `scrape` on each `amazon_url` with `formats: [{ type: 'json', schema: { price, currency, availability } }]`, upserts `streaming_device_prices`. Small delay between requests.
- **pg_cron**: weekly (Mondays 06:00 UTC), POSTs to that route with the project `apikey` header.
- **Server fn** `refreshStreamingPrices` (admin only) for the "Refresh now" button — wraps the same helper.

## Secrets / connectors
- **Firecrawl connector** must be linked (provides `FIRECRAWL_API_KEY`). I'll trigger the connect flow during build.
- No Amazon affiliate secret needed for now.

## Initial seed
8 devices to start (editable in admin):
- **High**: NVIDIA Shield TV Pro, Formuler Z11 Pro Max, Ugoos AM6B Plus, Dune HD Homatics Box R 4K Plus.
- **Medium**: Formuler Z11, Onn 4K Pro (Google TV), Xiaomi Mi Box S 2nd gen, Fire TV Stick 4K Max.

## Files
- new: migration (tables + RLS + GRANTs)
- new: `src/routes/_authenticated/_approved/streaming-devices.tsx`
- new: `src/routes/_authenticated/_approved/admin-streaming-devices.tsx`
- new: `src/lib/streaming-devices.functions.ts`
- new: `src/lib/streaming-prices.server.ts`
- new: `src/routes/api/public/hooks/refresh-streaming-prices.ts`
- edit: admin sidebar/nav for new entries
- data: seed via `supabase.insert`; pg_cron schedule via `supabase.insert`