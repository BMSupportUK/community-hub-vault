# No change — address collection at signup

Decision: do not collect or verify customer addresses at signup.

- Signup keeps the current signals: IP-based city/region/country, VPN/proxy flag, and precise GPS when the member has shared location.
- The new "Accurate to ~X km" line (already built) stays as the staff aid for judging location trust.
- No address or postcode fields are added to registration or checkout.

No code or database work required.
