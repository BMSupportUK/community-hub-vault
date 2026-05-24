## Plan: Membership box in sidebar

### 1. New component `src/components/app/MembershipBox.tsx`
Styled to match `ServiceStatusBox` (rounded card, gradient header bar, same typography). Reuses the data-loading logic currently inside `SubscriptionExpiry` (queries `app_credentials` for the signed-in user, realtime subscription, scheduled role revoke). Renders:

- Header strip: icon + "Membership" title (gradient bar like Service Status).
- Body: one row per credential, showing `{app_login_name}` and "expires on / expired on {formatted date}" using the user's timezone.
- Color cues: red for expired, amber for <7 days, neutral otherwise (matching current pill states).
- Hidden entirely when the user has no credentials with an `expiry_at` (same condition as today).

Keeps the existing `useScheduledRevoke` behaviour so role revocation timing is unchanged.

### 2. Sidebar wiring — `src/components/app/HomeChannelsSidebar.tsx`
Replace the footer with a fragment that renders `<MembershipBox />` first, then `<ServiceStatusBox />`, so Membership sits directly above Status in every sidebar instance.

### 3. Remove from header — `src/routes/_authenticated.tsx`
Drop the `<SubscriptionExpiry />` render (line 146) and its import. The existing `SubscriptionExpiry` component file can stay for now (small, self-contained); if you'd prefer, we can delete it since nothing else imports it.

### Technical notes
- No DB / RLS / server-function changes.
- No behaviour change to expiry revoke logic — same hook moved into the new component.
- The Membership box appears on every page that uses `HomeChannelsSidebar` (i.e. every approved page except `/home`, `/shop`, `/moderation`, `/store` which manage their own sidebars). If you want it inside those sidebars too, that's a follow-up (they each render their own `ChannelColumn` footer).

### Question
Should I also surface the Membership box inside the Home / Shop / Moderation sidebars (which currently render `ServiceStatusBox` themselves), or only in the shared `HomeChannelsSidebar`?