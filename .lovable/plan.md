## Add Strong Leap devices to streaming devices page

Add two new medium-tier Android devices from the STRONG brand:

### Devices

**Strong Leap-S1 (Android Stick) — medium tier**
- Google TV 4K HDR dongle, Amlogic S905Y4
- 2GB RAM, 8GB storage, Wi-Fi 5, Bluetooth 5.0
- Netflix/Disney+ certified, sideloads via Downloader
- Goes in **Android Sticks → Medium spec**

**Strong Leap-S3 (Android Box) — medium tier**
- Google TV 4K HDR box, Amlogic S905Y4
- 2GB RAM, 16GB storage, Wi-Fi 5, Ethernet, Bluetooth 5.0
- Official Google TV, sideloads via Downloader
- Goes in **Android Boxes → Medium spec**

### Steps

1. Generate two official-looking product images and upload to CDN.
2. Insert both devices into `streaming_devices` with `tier='medium'`, brand `STRONG`, specs, sideload notes, and Amazon UK affiliate URL.
3. No UI code changes needed — existing Medium spec sections will pick them up automatically.
4. Prices will auto-scrape on the next refresh job (same as other tiers).

### Notes

No schema changes. No new routes. Pure data + image additions.