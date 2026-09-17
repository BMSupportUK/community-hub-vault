# Google AdSense banner after the 1st post

Earn money from Google AdSense by showing a display advert after the first post in every forum topic.

## How it works

AdSense has two halves: the Google account side (only you can do this part) and the website side (I do this part).

### Your part — the AdSense account

1. Go to [google.com/adsense](https://adsense.google.com) and sign up with your Google account.
2. When it asks for your website, enter **bmsupport.uk**.
3. Google gives you a small code snippet containing your publisher ID (looks like `ca-pub-1234567890123456`). Send me that ID — you can find it any time in AdSense under **Account > Account information**.
4. I add the snippet to the site so Google can verify it. You then press **Verify** in AdSense.
5. Google reviews the site (usually a few days). Nothing shows until they approve it.
6. Once approved, in AdSense go to **Ads > By ad unit > Display ads** (or **In-article ads**, which fit nicely between posts) and create a unit. Send me the ad unit ID (the `data-ad-slot` number) or the whole snippet.

### My part — the website changes

1. Load the AdSense script once in the site head (`src/routes/__root.tsx`), using your publisher ID.
2. Add an `ads.txt` file at `public/ads.txt` with your publisher line — Google asks for this and revenue can be limited without it.
3. New `AdSenseSlot` component that renders the ad unit and only fills it when Google serves an ad (no empty box while an ad is unavailable).
4. Insert the slot **after the 1st post** in `forum.$board.$topic.tsx` (the forum thread page), styled to match the site so it sits naturally between posts.
5. Staff/admins see a labelled placeholder instead of the live ad, so moderation views stay clean and nobody on your own team generates invalid clicks.

## Important notes

- AdSense only serves real ads on your **published** domain (bmsupport.uk), not in the preview. So the ad must be checked after publishing.
- Google pays roughly per view/click; earnings depend on traffic and are modest for small forums.
- Don't click your own ads — Google bans accounts for that.

## Order of work

1. You create the AdSense account and send me the publisher ID.
2. I add the script + ads.txt + the after-first-post slot (showing a placeholder until approval).
3. You press Verify in AdSense and wait for approval.
4. Once approved, you create the ad unit, send me the slot ID, I wire it in and you publish.
