# Built-in private DNS for BM Player (alongside the VPN)

## Will it work?
It can help some customers, but it can't replace the VPN.

- **What it fixes:** internet providers that block by "address lookup" (DNS). Many UK home broadband blocks work like this, so a private DNS inside the app gets past them without a VPN.
- **What it doesn't fix:** blocks on the server address itself (used on match days under court orders), and providers slowing down streaming. Only the VPN gets past those.
- **Speed:** using DNS costs nothing and doesn't slow the picture, unlike a VPN.

So the best setup is: DNS on by default for everyone, and the VPN as the paid upgrade when DNS isn't enough.

## What gets built
1. A "DNS" switch on the home screen beside the VPN switch, styled like it (coloured dot, "DNS: On · Cloudflare"), on by default. Pressing it turns it on/off or picks Cloudflare, Google or Quad9. Nothing goes in Settings.
2. All BM Player traffic (logins, playlists, guide, channels in both players) finds servers through private, encrypted DNS instead of the broadband provider's.
3. When the VPN is on, the VPN handles everything and the DNS setting stays out of the way.
4. If a channel still won't open with DNS on, a short message suggests turning on the VPN (with a Get VPN link).
5. The same on Windows and Mac.

## Technical details
- Android: DNS-over-HTTPS resolver (OkHttp DnsOverHttps) shared by the website/provider clients and Media3's OkHttp data source; libVLC streams get the address resolved first and the host kept for the request, so the provider address is still never shown.
- Desktop: resolve through DoH in the main process before connecting; the renderer never sees addresses.
- Fallback to normal DNS only if the private DNS can't be reached, so nothing breaks on networks that block DoH.
- Release as box 6.31, Windows 0.4.123, Mac 0.1.123.
