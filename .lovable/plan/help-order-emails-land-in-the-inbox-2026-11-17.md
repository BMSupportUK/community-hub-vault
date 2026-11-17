# Help order emails land in the inbox

Your sending setup (notify.bmsupport.uk) is already verified and signed, so the remaining gains come from the email itself and your domain's reputation.

## What you can do (no code)
1. **Add a DMARC record for bmsupport.uk** at your domain provider (a TXT record named `_dmarc` with value `v=DMARC1; p=none; rua=mailto:you@bmsupport.uk`). Gmail and Apple Mail trust domains with DMARC more.
2. **Ask customers to mark it "Not spam"** and add noreply@bmsupport.uk to contacts — this trains their mailbox quickly.
3. Avoid sending many identical emails in a short burst to new addresses.

## What I'd change in the order email
- Use a plain, friendly subject that includes the order reference, e.g. "Your BM Support order ABC123 is ready" (generic "secure checkout" wording is a common spam trigger).
- Add a short plain sentence explaining why they received it, plus a contact line and the business name/address in the footer.
- Use bmsupport.uk wording consistently and keep the order password but label it clearly as "Order code" (big standalone passwords look like phishing).
- Show the checkout web address as text under the button, so it's not a button-only email.
- Apply the same footer to the other customer emails (payment outstanding, subscription reminder, login emails).

No change to who receives emails or when they're sent.

## Technical details
- Edit `src/lib/email-templates/manual-checkout.tsx` subject/body; add a shared footer component used by customer-facing templates.
- No sending/DNS code changes; DMARC is a user DNS step on the root domain (subdomain delegation unaffected).
