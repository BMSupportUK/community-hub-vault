# Private DNS inside BM Player (free, not a VPN)

None of the three options is in BM Player today. Private DNS is the only one that can live fully inside the app at no cost, so this plan adds it.

## What the customer gets
- A new Settings switch, **Private DNS**, which is on by default.
- When it's on, the box asks for channel server addresses over an encrypted link to Cloudflare or Google. The broadband provider can't see or block those lookups.
- A short line in Settings explains it: "Hides which servers you look up from your broadband provider. Your IP address is still visible to the channel server."

## Limits (stated honestly in the app)
- It does not hide the customer's IP address from the stream provider.
- It does not change their location.

## Technical details
- Add a private DNS resolver in Java with Cloudflare 1.1.1.1 as the main server and Google 8.8.8.8 as backup. Lookups time out after 3 s and fall back to the box's normal DNS so playback never breaks.
- BM Player only routes its own address lookups through it; the rest of the box is untouched.
- The setting is saved on the box.
- Add a unit test covering the fallback order and what happens on timeout.
- Release it as the next BM Player version and publish it only when you approve.
