# Release with the VPN fix, without the Stan Sport order change

## What changes
- **Stan Sport order change removed:** numbered channels go back to the order your provider gives them, in the Live TV guide and the full-screen Left channel list.
- **VPN fix goes live:** the server list shows UK servers first, then nearby countries (Ireland, Netherlands, Belgium, France, Germany), then far-away ones. **Use the best server** keeps boxes on UK servers even while they're connected abroad.

## Steps
1. Take the numbered-channel ordering out of the Live TV guide and the full-screen channel list, and delete its helper and test.
2. Publish the website and check the VPN server list puts UK first. Boxes get this without an app update.
3. Release box 5.95 (versionCode 406) so the Stan Sport change can't go out by accident. Run all app tests, sign with the BM key, upload, register 5.95 as current, and check the live file matches.

Windows and Mac are not changed.
