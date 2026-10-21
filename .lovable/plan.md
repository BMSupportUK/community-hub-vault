# Secure access for customers with no email

## Recommended approach
Use the secure order chat they already have. It is locked by their order password, so only they can open it.

1. On the customer's card, admin or management clicks **Send portal access**.
2. A one-use login link that lasts 24 hours is posted into that customer's secure order chat (the same place as the `/video` QR). It shows as a button plus a QR code they can scan on their phone.
3. When they open it, they set their 6-digit PIN and are asked to **add an email address**. The email is confirmed with a code, so it can't be mistyped. From then on, they use the normal "Send me a login link" email.
4. Their logins still only show after they enter the PIN, for 10 minutes.

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
