# VPN column on Link Device

## What the customer gets
- A new **3rd column: "VPN on your box"** on the Link Device page, next to the two that are already there.
- The customer types their VPN **username and password** (the "service credentials" from their VPN account, not their email login), picks which box, and presses **Send to box**.
- BM Player on that box gets the details, asks Android once to "Allow VPN connection", and then switches the VPN on by itself.
- The box picks the **best server**: the closest to the customer's area that has the **fewest people connected**. It checks again each time the VPN starts, and moves to another server if that one stops working.
- The box shows a small "VPN on · London #123" status pill. The column on the website shows the same, with **Turn off** and **Change server** buttons.
- The details are stored locked, read only by that box, and never shown back on the website, not even to staff.

## Defaults I've chosen (you skipped the questions)
- **Provider: NordVPN.** It publishes a list of the best servers that already ranks them by distance and number of connections, so "closest and least busy" works without guessing. Other providers can be added later.
- **Built into BM Player.** There's no extra app to install, and it works on Android boxes, Fire TV and phones.
- VPN use while watching is already allowed (Multi Room rule), so nothing in the household rules changes.

## Steps
1. **Website:** add the VPN column with a box picker, username and password, Send / Turn off / Change server buttons, and the live status.
2. **Backend:** store the details locked to the customer's own box, and let only that box collect them, using its private device token.
3. **BM Player (Android 5.62):** add a built-in VPN connection, choose the best server (closest and least busy), reconnect when the connection drops, show the status pill, and report the status to the website.
4. **Tests:** check that the server picker chooses the closest and least busy server, and that details can only be sent to the customer's own box.
5. Build, sign and publish 5.62, then publish the website.

## Not included
- Windows and Mac BM Player. Those need system-level VPN permissions, so they would be a separate job.

## Technical details
- New table `player_vpn_configs` (device_id, user_id, provider, encrypted username/password, enabled, server, status, updated_at). Owner-only RLS for writes. The box reads it through `/api/public/player` using its hashed device token. Credentials are encrypted with a server secret.
- Server functions `sendVpnToBox` and `setBoxVpn` follow the same pattern as `sendToBox` (ownership check plus "box is on" check).
- Android: `VpnService` with an embedded OpenVPN core (ics-openvpn library). Servers come from `api.nordvpn.com/v1/servers/recommendations?filters[servers_technologies][identifier]=openvpn_udp` near the customer's location, sorted by `load`. Logic goes in `VpnPicker.java`, with `VpnPickerTest.java`.
- Risk: the OpenVPN library makes the APK about 8 MB bigger and needs a native build. If that fails, the fallback is to send the details to the official NordVPN app instead.
