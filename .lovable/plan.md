# Auto-ban known IPTV agent signups

Today the blacklist only matches an exact email address or an exact IP, and only the IP is checked when someone signs up. A reseller who signs up from a fresh throwaway address on a new IP walks straight through. This adds domain-level blocking, checks the email at signup, and seeds a starter list.

## What changes for you

- The blacklist gains a third entry type: **email domain**. Blocking `example.com` blocks every address at that domain, now and in future.
- New signups are screened on **both** their email (exact address and its domain) and their IP. A match applies the banned role immediately, exactly like the current IP rule — the person sees a normal "awaiting approval" flow but can never get in.
- Existing accounts that match a newly added domain get banned at the moment you add it, the same way adding an email or IP already back-fills bans.
- The admin blacklist page gets a domain option in the add form, a type filter, and a **Bulk add** box so you can paste many domains/emails/IPs at once (one per line) and see how many were added, skipped as duplicates, or rejected as invalid.
- A starter list of throwaway and disposable-mail domains commonly used by IPTV resellers is seeded, marked with the reason "Seeded: known IPTV agent / disposable mail". Nothing is irreversible — any seeded row can be deleted from the admin page. Your own known agent domains and addresses go in on top via bulk add.

## Technical notes

- Migration: add `email_domain` to the `blacklist_kind` enum; rewrite `public.is_blacklisted(_email, _ip)` to also match `email_domain` against the part after `@` (case-insensitive, plus subdomain-safe suffix match), and add a seed insert for the starter domain list.
- `src/lib/blacklist.functions.ts`: accept `email_domain` in `addBlacklist` with domain validation, back-fill bans by scanning `auth.users` for addresses at that domain, and add a `bulkAddBlacklist` server fn that reuses the same normalise/validate/insert/back-fill path per line and returns per-line results. Kind is inferred per line: contains `@` → email, all digits/colons/dots → ip, otherwise domain.
- `src/lib/signup-info.functions.ts`: pass the signed-in user's email into the existing `is_blacklisted` call alongside the IP so email and domain hits ban too.
- `src/routes/_authenticated/_approved/admin-blacklist.tsx`: domain in the kind selector, kind filter on the list, and the bulk-add dialog.
