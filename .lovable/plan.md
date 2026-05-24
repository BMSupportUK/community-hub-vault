## Add a Service Status box to the Help Desk welcome panel

The screenshot points at the empty right-hand side of the "Welcome to the Help Desk" panel (inside the Welcome tab). The same kind of box already exists in the left icon-rail as `ServiceStatusBox` (`src/components/app/ServiceStatusBox.tsx`) — show live incidents from `status_incidents` with an Operational fallback and a link to `/status`.

### Changes

**File: `src/routes/_authenticated/_approved/tickets.tsx`**

1. Import `ServiceStatusBox` from `@/components/app/ServiceStatusBox`.
2. In the Welcome `TabsContent` (around line 405), restructure the inner rounded card into a two-column grid on `md+`:
   - Left column: existing H2 + paragraphs + the two action buttons (New ticket / View tickets), keeps `max-w-2xl`.
   - Right column: `<ServiceStatusBox />` wrapped in a div that neutralises its outer `px-2 pt-4` (e.g. `[&>section]:px-0 [&>section]:pt-0`) and constrains width (`md:w-[300px] md:shrink-0`).
3. On mobile, stack the status box below the text (default flex-col → md:flex-row behaviour).

No changes to `ServiceStatusBox` itself — it already handles loading, realtime updates, the "Read more →" link to `/status`, and the Members/Staff buttons. If those Members/Staff buttons feel out of place in the ticket context, I can hide them with a prop — flag this if you'd prefer a status-only variant.

### Files
- `src/routes/_authenticated/_approved/tickets.tsx` (Welcome tab panel JSX only)
- Optional: `src/components/app/ServiceStatusBox.tsx` if you want a `compact` / status-only prop
