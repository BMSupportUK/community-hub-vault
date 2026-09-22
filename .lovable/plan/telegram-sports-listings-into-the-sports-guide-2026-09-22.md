# Telegram sports listings into the Sports Guide

## The one catch with that link

An invite link on its own doesn't give us access. Telegram only lets our own
bot read messages in a group when an admin of that group adds the bot — and you
don't own this group, so we can't read it directly.

There is a way round it that needs almost no effort from you: **forward the
listing posts to our own bot**. You open the group, long-press a listings post,
Forward, pick "BM Support Sports Bot". That's it — a couple of taps per post,
and everything after that is automatic.

If you ever do get admin rights in that group (or set up your own group and
auto-forward into it), the same system picks the posts up with no further work.

## How it will work

```text
Telegram group post
      |  you forward it to our bot (2 taps)
      v
Bot receives it  ->  AI splits it into individual events
      v
Events land in the existing "Review Queue"
      v
You skim, fix any wrong category, press Import
      v
Events appear in the Sports Guide under their category
```

- Each forwarded post is split into one event per fixture, with time, date and
  the listed channels.
- The category and subcategory are guessed automatically from the fixture (the
  keyword routing the paste importer already uses); anything it can't work out
  is flagged for you.
- Nothing goes live until you approve it, so a bad guess can never reach the
  guide.
- The same post forwarded twice is ignored, so you can't create duplicates.
- The Review Queue gains a Telegram tab showing where each event came from, an
  "Approve all" button, and per-event category fixing.

## What you'll need to do once

1. Create a bot in Telegram with @BotFather (one minute) — or I can walk you
   through it.
2. Connect it here so the app can receive its messages.
3. Send the bot one message so it knows who you are; only your account and
   other admins can feed it.

## Technical notes

- Telegram connector (`standard_connectors--connect`, connector `telegram`) plus
  a webhook route at `src/routes/api/public/telegram/webhook.ts`, registered
  with `setWebhook` using a secret derived from `TELEGRAM_API_KEY`; the handler
  verifies `X-Telegram-Bot-Api-Secret-Token` and ignores senders that aren't an
  allow-listed admin Telegram user id.
- Migration: `telegram_sports_sources` (telegram user id → allowed, label) and
  new columns on `discord_import_queue` — `source text default 'discord'`,
  `source_ref text` (chat id + message id, unique index for idempotency),
  `forwarded_from text`. Grants + RLS mirroring the existing queue table
  (staff-only read/write, `service_role` all).
- Webhook stores the raw text immediately, then a server fn
  (`ingestTelegramPost` in `src/lib/discord-import.functions.ts`) reuses
  `splitWithAI` + `routeEvent` to produce queue rows with suggested
  category/subcategory; failures keep the raw text so nothing is lost.
- `src/routes/_authenticated/_approved/admin-sports-import.tsx`: Review Queue
  grows a source filter (All / Telegram / Paste), an Approve-all action, and a
  small "forwarded from" line per row. Import path is the existing
  `resolveQueueItem`, so Sports Guide pages and the parser stay untouched.
