# Sports guide page: one advert beside the guide banner

## What changes

On the public sports guide page only (`/guides/$id`, file `src/routes/guides.$id.tsx`), the top banner row currently shows:

    [ advert (468px) ]  [ guide banner (flex-1) ]  [ advert (468px) ]

It becomes a two-panel row — the guide banner and one advert, the same size, side by side:

    [ guide banner (3:1) ]  [ advert (3:1) ]

- Both panels render at the full 3:1 shape (the wide advert size, 900x300 / 1800x600), so the advert is full size and the guide banner is exactly the same size as the advert next to it.
- On very large screens (xl and up, where the side adverts currently appear) both panels sit side by side at equal width.
- Below xl the behaviour stays as today: the advert is hidden and the guide banner is full-width.

## Implementation notes

- Replace the 3-panel `flex` row with a 2-panel grid: `grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-stretch`.
- Guide banner panel keeps its blurred backdrop + `object-contain` image treatment, now sized by the grid so it matches the advert's proportions.
- The advert panel keeps `AdSenseSlot slot="home"` (renders BM Support's own rotating leaderboard banners, sports_guides zone). With only one advert slot on the page there is no duplicate-advert sibling conflict.
- Verify `RotatingAffiliateBanner` fills its container at the 3:1 shape and confirm the advert and banner align to identical height in the browser at 1280+ and mobile widths.
- No other pages change: forum, home, and match-day adverts are untouched.

## Verification

- Open a live guide in the preview at a wide desktop size: one advert, same size as the banner, side by side.
- Check a phone width: banner full-width, no advert, as today.
- Build log clean before finishing.
