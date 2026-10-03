---
name: Location mandatory for direct sign-ups
description: Direct BM Support applicants must share GPS location before any access request; no opt-out, no appeal path for refusal
type: constraint
---

Location sharing is **mandatory** on the security gate for direct (non-referral, non-Fan Zone) BM Support applicants.

- No "Don't allow" option — the ask screen only offers "Allow location".
- Refusal/browser-denied shows a "Location Required" screen telling them to enable it in browser site settings and retry; no access ticket and no appeal can be created until location is shared.
- Both the ask screen and the "Location Required" screen must state that location sharing is **mandatory to protect the security of accounts**.
- Refusal/browser-denied shows a "Location Required" screen telling them to enable it in browser site settings and retry; no access ticket and no appeal can be created until location is shared.
- Referral-code and Boro Fan Zone registrations still bypass location entirely (locState "skip").
- Elsewhere GPS is still captured silently only when permission already exists (GpsCapture).
- Approved members are unaffected.
