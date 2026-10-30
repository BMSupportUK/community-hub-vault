# tv-direct-install rules
- This app runs on the TV and is install-only: Android PackageInstaller (never self-ADB), own 30-min Direct Install PIN + install website codes (support codes refused via installOnly), downloaded only through expiring per-customer `/di/$code` links.
- Direct Install has its own PINs (`enabler_login_pins.kind='direct'`, 30 min, generated on the website wizard's PIN step); enabler-login matches PIN kind to the app so Enabler and Direct Install PINs never cross.
