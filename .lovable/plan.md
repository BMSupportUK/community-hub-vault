# Nameplate Shop — Discord-style free & purchasable nameplates

## Important note on Discord's actual nameplates
Discord's real nameplate artwork is copyrighted and cannot be copied or extracted into this app. Instead, we will create **original animated nameplates in the same spirit** (neon glitch, cute critters, retro gaming, football themes) and build a Discord-style shop with free and purchasable items.

## What exists today
- `nameplates` table + admin manager at `/admin-nameplates` (create, upload image/gradient, assign to users)
- `user_nameplates` grants table, `Nameplate` render component, animated nameplate CSS classes already in use
- Users can only use nameplates an admin assigns them — there is no self-serve shop

## Plan

### 1. Database changes
- Add `price_credit integer not null default 0` and `preview_emoji text` columns to `public.nameplates` (0 = free for everyone, >0 = purchasable with account credit). Include GRANTs and update RLS policies.
- Make `user_nameplates` the ownership record for both purchased and admin-granted nameplates (already exists).
- Add a server-side purchase flow (`buyNameplate` server function) that:
  - Checks the nameplate is active and not already owned
  - Checks/deducts the user's credit balance atomically
  - Inserts the `user_nameplates` row
  - Returns a friendly error when balance is too low

### 2. Seed ~10 original nameplate designs
CSS/gradient + animated-emoji nameplates (new `animation_class` entries in `styles.css` + `Nameplate.tsx`), mixed free and paid:
- **Free**: Boro red/white scarf wave, simple aurora gradient, static sparkle
- **Paid**: neon glitch grid, cyber rain, disco ball, galaxy swirl, thunderstorm, candy pop critter, retro arcade scanlines
Each gets a preview swatch in the shop. All original art/CSS — no Discord assets.

### 3. Nameplate Shop page (new route `/nameplates`)
- Grid of cards showing a live animated preview, name, and price (or "Free")
- Free nameplates: one-click "Unlock" → adds to `user_nameplates` and equips
- Paid nameplates: "Buy for X credit" button showing the user's current balance; insufficient balance shows a hint to top up
- "Equip" / "Equipped" state per owned nameplate (uses existing equip logic from the profile/nameplate picker)
- Section headers: **Free** and **Shop**, Discord-shop style

### 4. Admin updates (`/admin-nameplates`)
- Add a **price (credit)** field to the create/edit dialog
- Show price badge on nameplate cards; keep existing Assign dialog for manual grants

### 5. Picker integration
- Update `NameplatePicker` so owned-but-paid nameplates appear alongside granted ones (it already lists `user_nameplates` entries, so mostly verify)

### 6. Verification
- Build check + Playwright pass: visit shop as a test user, unlock a free nameplate, attempt a purchase with insufficient credit (expect friendly error), confirm equip state renders behind the username.

## Technical notes
- Purchase deduction runs inside one server function using the authenticated Supabase client; a DB unique constraint on `(user_id, nameplate_id)` prevents duplicate buys.
- No Stripe checkout for nameplates in this phase — credit balance only (avoids mixing micro-purchases with the orders flow).
