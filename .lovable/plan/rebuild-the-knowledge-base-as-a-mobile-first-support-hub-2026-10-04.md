# Rebuild the Knowledge Base as a mobile-first support hub

## Scope
Redesign only the authenticated Knowledge Base experience. Keep its existing Supabase data, ratings, search, article reading, video playback, and staff editing tools intact.

## Build
- Replace the current dense header and tab layout with a compact mobile header: brand lockup, avatar/profile affordance, “Knowledge Base” label, and a clear page title.
- Add a prominent rounded search field near the top. Search will continue matching article titles, excerpts, and body text across all categories.
- Turn categories into a horizontal swipeable row of large rounded tiles with distinct accent colors, Lucide icons, article counts, and visible active state. Tapping a tile filters the guide feed.
- Add a “Featured Guides” area using one large visual feature card followed by a stacked feed of smaller guide rows. Use existing article images where available and polished icon/gradient treatments when no image exists.
- Preserve badges, draft visibility for staff, ratings, category/article ordering, and all moderator actions. Staff controls will remain available without cluttering the member view.
- Rebuild the article reader for phones: compact back action, clear category/title hierarchy, full-width readable body, responsive uncropped videos, and a compact rating card after the article on mobile. Keep a useful supporting rail on wide screens.
- Add a compact Knowledge Base mobile bottom bar for Home, Guides, Search, and Profile-style actions, while respecting the application shell and avoiding duplicate navigation on larger screens.

## Visual direction
- Mobile-first layout based on the reference: deep near-black navy background, white typography, electric blue primary accents, green/purple/orange category accents, and thin cool-gray borders.
- Use the project’s Space Grotesk display type and Inter body type, with strong hierarchy and restrained gradients.
- Keep cards mostly flat and solid, with generous rounded corners and only subtle depth; no excessive glow or pill-shaped containers.
- Reuse the existing Knowledge Base artwork where it improves the featured card; do not add decorative imagery that competes with guide content.

## Responsive behavior
- Phone: single-column feed, horizontal category scroller, large touch targets, concise cards, and bottom navigation.
- Tablet: two-column guide grid where space allows.
- Desktop: wider content canvas with category/filter support and article rating rail, while retaining the new visual system.

## Verification
- Test search, category switching, featured/regular guide opening, article back navigation, ratings, embedded/uploaded video playback, and staff CRUD controls.
- Check the page at phone and desktop widths, including long titles, empty categories, draft articles, missing images, and video-heavy articles.
- Confirm no playback resets occur during background renders and no existing Knowledge Base data or permissions change.
