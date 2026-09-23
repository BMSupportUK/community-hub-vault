# Switch sports importing to manual paste

The Telegram bot stays untouched, but the importer's main way of working becomes copy-and-paste: you copy the listings post from the Discord channel, paste it into the importer, and it lands in the review queue exactly like a forwarded post does today — one whole block, no splitting.

## What changes on the Sports Importer page

1. **Paste becomes the main tab.** The importer opens on "Paste & Import" and it's presented as the primary way to add listings. All wording that says "Discord" or "Telegram" is changed to plain wording like "Paste a listings post", so nothing depends on where the text came from.
2. **Pasted posts go to the review queue as one whole block.** Currently the paste tab uses AI to split the text into separate events first. That step is removed from the main flow — the pasted post is queued whole (same as Telegram posts are now), so every import follows the identical process you're used to:
   - pick the category → OK
   - pick the sub categories → OK
   - pick the guide (with the tick next to the selected guide's name) → Import
   - with the Back buttons to step back
3. **Queue filter labels updated.** The "Telegram" / "Pasted" filter pills become "All" and "Pasted" (old Telegram items still show under All so nothing already queued is lost).
4. **Empty-queue message updated.** The "Forward a listings post to your Telegram bot" hint is replaced with paste instructions.
5. **Importer step flow fix stays.** The recent fix where picking a category with no sub sections (Daily Sports, Sports Passes) jumps straight to the guide list remains in place.

## What does NOT change

- The review queue, category/subcategory/guide selection steps, UK/ET timezone choice before import, draft-only imports, and card sorting by start time → event → channels all stay exactly as they are.
- Existing queued items and all guides are untouched.
- The Telegram webhook is left in place but unused — it can be removed later if you want.

## Technical details (for reference)

- Edits are confined to `src/routes/_authenticated/_approved/admin-sports-import.tsx` (paste tab default, whole-block queueing via a small server function that inserts into the existing import queue with source "paste", label/empty-state wording) plus one new server function in `src/lib/discord-import.functions.ts` (`queuePastedPost`, staff-only, mirrors the Telegram ingest shape).
- No database changes, no new tables, no secrets needed.
