# Add VPN Shop as a second VPN provider

VPN Shop runs alongside VPNresellers. Current VPNresellers customers keep their logins and nothing changes for them.

## What you will get
- **Choice of provider for each VPN in the Dashboard VPN section:** VPNresellers or VPN Shop. New sales use a default provider that admin sets.
- **The shop stays the same:** £2/month, created only after the sale completes, ends on the subscription end date, and renewals still ask "Keep your VPN?". The provider is hidden from customers.
- **Allocation box:** admin can also allocate existing VPN Shop logins to subscribers.
- **Boxes, phones, Windows and Mac:** the VPN switch, coloured light, change-location button and traffic list work the same for both providers. The server list shows the servers for the customer's provider, UK first.
- **Live connections:** shows the provider and server under the VPN pill.

## Step 1: check how VPN Shop can be connected
VPN Shop's public pages don't say whether there is an API. I will check their panel and documentation before building anything.
- **If there is an API:** logins are made, extended and switched off automatically, like VPNresellers now. You add the API key when asked.
- **If there is no API:** after a sale completes, staff see a "Make VPN Shop login" task. They make the login in the VPN Shop panel and paste the username, password and WireGuard file into the website. The expiry is shown so it matches the subscription. Live traffic bars appear only if VPN Shop publishes server load.

## Not done without your go-ahead
- Moving existing VPNresellers customers over.
- Buying credits or spending them on test logins.

## Technical details
- Add a `provider` column to `vpn_subscriptions` and `vpn_accounts`, defaulting to 'vpnresellers'. Add an app setting for the default provider.
- Add a provider interface in `src/lib/vpn-provider.server.ts`, with createAccount, extend, disable, servers and wireguardConfig. Move the existing VPNresellers code behind it and add `vpnshop.server.ts`.
- Keep the `vpn_servers`, `vpn` and `vpn_status` player actions the same, so no new box build is needed unless the WireGuard config format differs.
- The manual route uses an admin/management-only RPC that stores pasted configs encrypted with the existing VPN_CRED_KEY.
- Tests: the price stays £2 × months, nothing is created before completion, the expiry matches the subscription, and a VPN Shop account never gets VPNresellers servers.
