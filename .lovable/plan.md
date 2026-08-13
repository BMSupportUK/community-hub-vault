# Auto-post the Boro team sheet into the match day thread

When Middlesbrough's official account posts the first-team line-up graphic (usually ~1 hour before kick-off), the app picks it up and adds it as a reply in the match day thread for that fixture — visible instantly in both the members forum and the public Boro Fan Zone (they share the same boards and threads).

## How it will work

1. A background check runs every 2 minutes from 3 hours before kick-off until 15 minutes after, for the next league/cup fixture.
2. It reads the latest posts from the official Middlesbrough X/Twitter account and looks for a team-news post: a post with an image whose text matches line-up wording ("Your Boro team", "team news", "line-up", "XI", "Here's how we line up").
3. When it finds one, it grabs the image and posts a single reply in the match day thread for that fixture:
   - Title line: "Team news — official line-up"
   - The team sheet image, plus the post text and a link to the original post.
4. The reply is posted once per fixture (guarded so restarts or repeated checks never duplicate it), and appears in real time because the thread already streams new posts live.
5. If the account posts an updated/corrected graphic, a second reply is added rather than overwriting the first, clearly marked as an update.

## Matching the thread to the fixture

Match day threads are titled like "Boro v Lincoln City 14-08-26 KO 15:00" in the Match Day board. The job matches on the date in the title (and opponent name as a secondary check). If no thread exists for that fixture yet, nothing is posted and the fixture is skipped — no thread is created automatically.

## Admin controls

A small "Team sheet" panel in the admin Boro area shows: the fixture being watched, whether a team sheet has been captured, and buttons to
- re-check now,
- paste an image URL / upload manually and post it (fallback if X blocks reads),
- undo/remove the auto reply.

## Technical notes

- New table `boro_team_sheets` (fixture_id, topic_id, tweet_id, image_url, caption, posted_at, post_id, status) with RLS: read for authenticated, all for service_role; used as the idempotency guard.
- New `src/lib/boro-team-sheet.server.ts`: reads the official account's recent posts via X's public syndication endpoints (same approach already used by `src/routes/api/public/tweet.ts`, which reliably resolves post media), extracts the first image of the matching post, and returns a DTO. Falls back to a Firecrawl scrape of the post URL if syndication returns no media.
- New cron route `src/routes/api/public/hooks/boro-team-sheet.ts` (pg_cron, every 2 minutes): finds the in-window fixture from `boro_fixtures`, locates the Match Day topic, calls the reader, and inserts a `forum_posts` row (image `<img>` in the sanitised post body, matching how forum images are already stored) attributed to a designated system account.
- New `src/lib/boro-team-sheet.functions.ts` for the admin panel actions (admin/management role check, service-role write inside the handler).
- No change to the match centre strip or fixture sync logic.

## Out of scope

- Reading Facebook directly (login-walled for automated fetches); the same graphic from the official X account is used instead.
- Creating match day threads automatically.
- Opposition line-ups or player-by-player breakdowns.
