# Phone Live TV redesign (BM Player Android, phones only)

TV boxes, Fire TV, Windows and Mac stay exactly as they are. Only phone screens change.

## What's wrong now
- The preview sits on its own with a lot of empty space, and the guide is hidden behind a "View EPG" pop-up.
- Categories and channels are behind a slide-out drawer, so you can't see what's on at a glance.
- It's a TV layout shrunk down, not something built for a thumb.

## New phone layout (top to bottom)

```text
+----------------------------------+
| [ Preview picture 16:9 ]   [ ⛶ ] |  stays pinned at the top
| Sky Sports Main Event  ● LIVE    |
| Premier League: Boro v Leeds     |
| 15:00–17:00  ████░░  45 min left |
+----------------------------------+
| UK Free to air | Sports | Hub >  |  swipeable category chips
+----------------------------------+
| 🔍 Search channels         🎤    |  one search bar
+----------------------------------+
| [logo] 101 BBC One           ★   |
|   Now: News at Six   ███░░       |
|   Next 18:30 Regional News       |  channel list, one row each
| [logo] 102 ITV1                  |
|   Now: ...                       |
+----------------------------------+
|  Channels  |  Guide  | Favourites|  bottom tabs
+----------------------------------+
```

- **Pinned preview:** tap a channel row to preview it at the top; tap the preview again (or the ⛶ icon) for full screen. Under it: channel name, programme, times, progress bar and minutes left.
- **Category chips:** a horizontal swipe row replaces the hidden drawer. Your saved order and "UK | Free to air" first still apply. Adult categories keep their existing lock.
- **Channel rows:** logo, number, name, what's on now with a progress bar, and the next programme. Favourite star on the right. Fault badges from Sports Guide tickets still show.
- **Bottom tabs:**
  - Channels — the list above.
  - Guide — the existing Sky-style grid, full height, no pop-up needed (reminders still set here).
  - Favourites — your synced favourites as the same rows.
- **Turning the phone sideways:** the preview goes full screen, like most phone TV apps.
- Same dark BM colours and fonts; bigger touch targets (rows at least 64 high), kept clear of the phone's back/home gesture edges.

## What stays the same
- Previews only start when you tap, never on scroll.
- Channel menu, catch up, Report a problem, reminders, Recently watched (no adult channels), VPN pill and connection status.
- Screen stays awake while playing.

## Technical details
- New phone-only screen built in native views inside MainActivity (branch on `isPhone()`), reusing LiveDrawerData, LiveNowNext, GuideGridView, GuideLogoLoader, GuideSafeArea, ChannelHealth and existing preview start/stop.
- Category chips use a horizontal RecyclerView/HorizontalScrollView fed by CategoryOrder; channel list is a RecyclerView with view recycling and lazy now/next fetches.
- Replace the phone "View EPG" pop-up with the Guide tab; update `tv-player/app/AGENTS.md` phone rules (rule 6/7/9 phone parts).
- Add tests beside LiveGuideHeaderTest for: phone uses the new layout, boxes keep the old one, default category, tap-to-preview only.
- Release as box 6.37 after a build and signing-key check.
