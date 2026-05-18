## Nameplates (Discord-style)

Decorative banner behind a user's name, like Discord nameplates. Admins build the catalog, users pick one to equip, and it shows up everywhere the user's name appears.

### Database

New tables (migration):

- **`nameplates`** — admin-curated catalog
  - `name`, `description`
  - `image_url` (uploaded image, optional)
  - `gradient_css` (e.g. `linear-gradient(...)`, optional fallback)
  - `is_active`, `sort_order`
  - RLS: anyone approved can SELECT active rows; only admin/management can INSERT/UPDATE/DELETE

- **`user_nameplates`** — which nameplates a user can equip (unlocked)
  - `user_id`, `nameplate_id`, `unlocked_at`
  - RLS: user can SELECT own rows; admin/management can manage all

- **`profiles.equipped_nameplate_id`** — nullable FK to `nameplates`
  - User can update only their own; must reference an unlocked nameplate (validated via trigger)

New storage bucket **`nameplates`** (public) with RLS so only admin/management can upload.

### Admin UI

New route: **`/admin/nameplates`** (admin/management only)
- Grid of existing nameplates with preview
- Create / edit modal: name, image upload, optional CSS gradient, active toggle, sort
- Per-nameplate "Assign to users" panel: search members, toggle who has access

### User equip flow

On the profile page (`/u/$username`, own profile only):
- "Nameplate" button opens a picker dialog
- Shows all unlocked nameplates + a "None" option
- Click to equip → updates `profiles.equipped_nameplate_id`

### Render surfaces

A new `<Nameplate />` component renders the user's equipped nameplate as a background strip behind their name. Wire it into:
1. **Members directory cards** — replaces the static `profileHeader` strip when user has a nameplate
2. **Profile page header** (`/u/$username`)
3. **Chat messages** — small inline strip next to the username in `ChatChannel` message rows
4. **Avatar menu / sidebar** — behind the current user's name in `UserAvatarMenu`

Component fetches nameplate data via a small client cache keyed by `equipped_nameplate_id` (already in profile rows) to avoid N+1 queries — the existing profile loaders just need to also select `equipped_nameplate_id` plus a join on `nameplates`.

### Out of scope (for now)

- Animated/Lottie nameplates (start static; can add later)
- Marketplace / purchase flow (admin assignment only)
- Nameplate previews in notifications/emails

```text
nameplates (catalog) ──┐
                       ├─► user_nameplates (unlocks) ──► profiles.equipped_nameplate_id
admin upload ──────────┘                                          │
                                                                  ▼
                                             <Nameplate /> renders on members/profile/chat/menu
```
