# Move member subscriptions into the home welcome panel

## What will change

- On non-staff member accounts, move **Your Subscription Details** from the right sidebar into the welcome panel, directly beneath the welcome text.
- Restyle the compact subscription box to sit naturally inside the purple welcome area while keeping its account details, status, expiry date, and **View Next Subscription Details** control fully usable.
- Remove the member square advert from the home page and replace it with the vertical skyscraper advert in the right sidebar.
- Leave the staff home layout unchanged: staff keep their Working Status box and vertical advert.

## Layout safeguards

- Keep the existing welcome wording, hero image, quick links, and overall visual hierarchy.
- Constrain the embedded subscription box so it does not crowd the welcome text or force controls off-screen.
- On phones, stack the welcome text, subscription details, and hero image cleanly; on desktop, preserve the current two-column hero composition.
- If a member has no subscription details, the empty/loading state will reserve only the space it needs.

## Verification

- Check a real non-staff account with one and multiple subscriptions at desktop and phone sizes.
- Confirm the skyscraper advert appears in the member sidebar and no square advert remains there.
- Confirm the member home still fits cleanly, the next-subscription button is visible, and staff accounts are unchanged.

## Technical details

- Update the member-only branch of the home page and add an embedded visual variant to the existing subscription card rather than duplicating its data logic.
- Preserve the existing advert rotation, targeting, view, and click tracking by continuing to use the skyscraper advert slot.
