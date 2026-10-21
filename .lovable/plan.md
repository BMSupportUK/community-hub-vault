# Secure access for customers with no email

## Recommended approach
Use the secure order chat they already have. It is locked by their order password, so only they can open it.

1. On the customer's card, admin or management clicks **Send portal access**.
2. The customer's own portal link (`bmsupport.uk/portal/<their code>`) is posted into their secure order chat, with a QR code. This is their permanent way in, and they should save it.
3. The first time only, the posted link also signs them straight in. That sign-in works once and lasts 24 hours.
4. Once inside, they set their 6-digit PIN and **add an email address**, confirmed with a code. After that, opening their portal link and tapping "Send me a login link" emails them a new 24-hour login every time.
5. If they still haven't added an email, staff can press Send portal access again to post a new one-time sign-in to the same portal link.
6. Their logins still only show after they enter the PIN, for 10 minutes.

## Why not other options
- Text or WhatsApp: messages can be read by anyone holding the phone, and the address isn't checked.
- Staff reading details out: there's no record of it, and anyone could pretend to be the customer.
- Showing details without a login: not safe.

## Rules
- Only admin and management can send portal access. Staff can't.
- Sending a new link stops any older unused link working.
- Each send is recorded with who sent it and when.
- Customers with no site account get an account created when they first open the link, using the email they add.

## Technical details
- Reuse `customer_portal_links` with a nullable `user_id` plus a manual-customer key; add a `sent_by` column.
- Post the link as an automated checkout chat message using the existing QR card pattern.
- The redeem page asks for an email, verified by a 6-digit code emailed through the app email template, then creates or links the site account and marks the profile as email-verified.
- Tests: link is one-use, lasts 24h, staff are refused, and a newer link revokes the older one.
