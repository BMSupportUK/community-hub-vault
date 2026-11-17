# VPNresellers VPN built into BM Player

The VPN switch, server picker and per-device login come back, this time using your VPNresellers reseller account. The old "never restore VPN controls" rule gets lifted. The old 5.63 VPN build stays unpublished; this is a fresh build.

## What you'll get
- **Website, Admin Dashboard → BM Player → VPN:** a list of the VPN logins for each linked device (username, server, on/off, data used). You can switch a device's VPN on or off, change its server, or make a new password for it.
- **BM Player (Android/Amazon boxes and phones):** a VPN card in Settings with an On/Off switch, a server picker (country and city, quickest first), and a status line ("Connected to London").
- **Automatic logins:** only once a sale that includes the VPN is completed, BM Support creates a VPNresellers account for it with a generated username and a strong password. The box fetches these itself, so customers never type them in or see the password.
- **Shut-off rules:** when a device is unlinked or its subscription runs out, its VPN account is switched off at VPNresellers too. Staff and test accounts stay exempt, as they are now.

## Charging for the VPN in the shop
- Every package in the shop (Single 1/6/12 months, Multi Room, Triple Room) gets an optional **"Add VPN"** tick box at checkout, priced at **£2 a month** of the package (£2 on 1 month, £12 on 6 months, £24 on 12 months; Multi Room and Triple Room the same per month).
- The VPN price is added to the order total and shown on the order, the invoice, and Profit & costs as its own line.
- The VPN login is never created before the sale is complete. Each completed order with the VPN creates or extends the VPN logins for that customer's devices until the package's end date, so the VPN and subscription always end on the same day. Renewals carry it on if it's ticked again. With no VPN on the order, the switch in the player shows "Add VPN to your next order" instead.
- Staff manual orders get the same tick box.

## What I need from you
- Your **VPNresellers API token**. You make it in your VPNresellers reseller panel, and you'll enter it in a secure box, never in chat. I'm not linked to VPNresellers yet.

## Assumptions (tell me to change)
- Customers can switch the VPN on and off and pick servers in the player. Staff can do the same from the dashboard.
- Android boxes and phones only to start. Windows and Mac come later.
- Uses WireGuard if your VPNresellers plan offers it, otherwise OpenVPN.

## Steps
1. Save the VPNresellers token and check it works by listing your servers.
2. Add the database records for each device's VPN account, with the password locked using the existing encryption key.
3. Add the website server code to create, enable, disable and delete accounts, change passwords, list servers and build the connection file.
4. Add the player endpoints for the device: status, switch on/off, choose a server, fetch the connection file.
5. Add the dashboard VPN page to the BM Player admin sections, with its own role permission.
6. Android: a built-in VPN connection with the Settings card, an "always reconnect" option, and a key icon while connected.
7. Add tests for: VPN adds £2 × package months to the total; a generated login is unique per device; an unlinked or expired device gets switched off; a customer can't control another device's VPN.
8. Shop: add the VPN option to the checkout, order total, invoices and profit report; switch VPN access on when an order is paid and off when it expires.
9. Build and release box 5.84 after the tests pass, then check the download from the website.

## Technical details
- VPNresellers REST API (bearer token): accounts create/enable/disable/delete/change_password, servers list, configuration download. Base URL and endpoints to be checked against their docs before coding; it becomes a custom connector so the token never touches code.
- New `player_vpn_accounts` table (device id, profile id, vpnr account id, username, password cipher via the existing `lockVpnCreds`, server id, enabled, timestamps). RLS: owner reads their own non-secret fields; admin/management through `player_section_allowed('vpn')`; the password only goes out through device-token server code.
- Reuse the leftover `src/lib/box-vpn.server.ts` encryption. Retire the old Nord/Surfshark picker paths in favour of VPNresellers.
- Android: `VpnService` plus an embedded WireGuard library (or ics-openvpn). Settings is unlocked by the account password, as it is today; parental and inactivity behaviour unchanged.
- Update memory: replace the no-VPN rule with "VPN via VPNresellers only; old 5.63 build never republished."
