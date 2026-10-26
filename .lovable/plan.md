# Forgot Account Login helper chat

## What the customer sees
When a customer opens a ticket in **Forgot Account Login**:

1. **Welcome message (always, any time of day)** — friendly helper message, never the out-of-hours notice:
   "Hi! Let's get you back into your account. Your app logins are kept safe on your **Service Credentials** page." with a **Open Service Credentials** link to the customer portal's Service Credentials page, plus short steps (open the page, unlock it, copy your username and password into the app).
2. Under the message, quick-reply buttons:
   - **I found them and I'm logged in**
   - **I can't find them**
   - **I found them but still can't log in**
3. Customer taps a button — their choice is posted in the ticket as their reply, and the helper answers:
   - **Logged in** → "Brilliant, glad you're back in! I'll close this ticket for you now." The ticket closes automatically.
   - **Can't find them** → one tip message (where the page is in the side menu, what to do if it's locked / needs the email code), then the buttons again.
   - **Still can't log in** → "No problem, I've passed this to our team — a staff member will reply here." The buttons disappear and the ticket waits for staff as normal.
4. If the customer types their own reply instead, the buttons disappear and the ticket goes to staff as normal.
5. Staff see the whole helper conversation in the thread.

## Rules
- Applies only to the Forgot Account Login category; other categories keep their current messages, including the out-of-hours notice.
- Out-of-hours notice is skipped for Forgot Account Login tickets.
- Only the ticket's customer can tap the buttons; only "Logged in" closes the ticket, and only for their own Forgot Account Login ticket.

## Technical details
- `tickets.tsx` create flow: replace the `account` welcome text with the new helper message (link to `/portal/logins`) and skip `getOutOfHoursMessage()` when `cat.slug === "account"`.
- Helper messages carry a marker (e.g. a metadata/attachment flag) so the thread renders the quick-reply buttons under the latest helper message while the ticket is open and no later customer/staff message exists.
- New authenticated security-definer RPC `account_helper_reply(_ticket_id, _choice)`: checks caller owns the ticket and it is in the `account` category, inserts the customer's choice and the helper reply, and for "logged in" sets the ticket to closed. Granted to `authenticated`; added to the SECURITY DEFINER allowlist memory.
- Ticket thread change is limited to rendering the buttons (user explicitly asked for this ticket change; the locked ticket alerts/realtime code is not touched).
- Test: choice "logged in" closes only own account-category tickets; "still stuck" leaves it open.
