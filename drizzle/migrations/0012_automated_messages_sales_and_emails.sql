ALTER TABLE public.automated_messages ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'message';
ALTER TABLE public.automated_messages ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.automated_messages ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'General';

UPDATE public.automated_messages SET category = 'Support tickets' WHERE key LIKE 'ticket_%';

INSERT INTO public.automated_messages (key, label, description, category, channel, body, placeholders, sort_order) VALUES
('order_placed_ticket', 'New order — order summary message', 'First message posted into the support ticket that opens when a customer places an order.', 'Sales & orders', 'message',
'🧾 New order placed
Order ID: {order_id}
Order type: {order_type}{existing_accounts}
Adult content access: {adult_access}

Items:
{items}', '{order_id,order_short,order_type,existing_accounts,adult_access,items}', 100),
('order_pay_card', 'New order — how to pay (card / crypto)', 'Payment instructions posted after an order is placed, for customers paying by card or crypto.', 'Sales & orders', 'message',
'💳 How would you like to pay for this order ({total})?

Step 1 — Click the "Pay" button in the order panel on the right-hand sidebar at the top of this ticket, then choose your payment method: Square (card / Apple Pay / Google Pay), Stripe (card), or USDT (crypto).

Step 2 — Once you''ve sent payment, press the "I''ve paid" button so we can check Stripe and Square and confirm your order. If paying by Crypto please post a screenshot of the crypto transaction so our team can match it against our payment records and mark the order as paid.', '{total}', 110),
('order_pay_bank', 'New order — how to pay (bank transfer)', 'Payment instructions posted after an order is placed, for customers approved for bank transfer.', 'Sales & orders', 'message',
'🏦 How would you like to pay for this order ({total})?

Your account is set up for bank transfer.

Step 1 — Click the "Pay" button in the order panel on the right-hand sidebar at the top of this ticket, then press "Show bank details" and send the payment quoting the reference shown.

Step 2 — Once you''ve sent the transfer, press "I''ve paid by bank transfer" so our team can check the account and confirm your order.', '{total}', 120),
('order_payment_received', 'Payment received confirmation', 'Posted to the order thread and ticket once a card or crypto payment is confirmed.', 'Sales & orders', 'message',
'✅ Payment received via {provider} for order #{order_short} — {total}.
Payment date: {paid_at} (UK time){reference}{receipt}{items}

🙏 Thank you for your payment — we really appreciate your custom. Your order is now being processed and we''ll update you on this ticket.', '{provider,order_short,total,paid_at,reference,receipt,items}', 130),
('order_bank_transfer_reported', 'Bank transfer reported by customer', 'Posted when a customer presses "I''ve paid by bank transfer" so staff can verify the funds.', 'Sales & orders', 'message',
'🏦 Bank transfer reported by the customer for order #{order_short} — {total}.
Payment reference: {reference}
Reported: {reported_at} (UK time)

⏳ Awaiting verification — please check the bank account and confirm the payment on this order once the funds have landed.', '{order_short,total,reference,reported_at}', 140);

INSERT INTO public.automated_messages (key, label, description, category, channel, subject, body, placeholders, sort_order) VALUES
('email:account-approved', 'Account approved', 'Sent when an account is approved.', 'Emails', 'email', '✅ Your BM Support account is approved', '', '{displayName,loginUrl}', 200),
('email:account-banned', 'Account banned', 'Sent when an account is banned.', 'Emails', 'email', 'Your BM Support account has been suspended', '', '{displayName,reason}', 210),
('email:fan-zone-approved', 'Fan Zone access approved', 'Sent when Boro Fan Zone access is approved.', 'Emails', 'email', '✅ Your Boro Fan Zone access is approved', '', '{displayName}', 220),
('email:fan-zone-banned', 'Fan Zone access removed', 'Sent when Fan Zone access is revoked or banned.', 'Emails', 'email', 'Your Boro Fan Zone access has been removed', '', '{displayName,reason}', 230),
('email:fan-zone-appeal-reply', 'Fan Zone appeal reply', 'Sent when staff reply to a Fan Zone appeal.', 'Emails', 'email', 'Reply to your Boro Fan Zone appeal', '', '{displayName,message}', 240),
('email:ticket-reply', 'Support ticket reply', 'Sent when staff reply to a support ticket.', 'Emails', 'email', 'New reply to your ticket: {ticketSubject}', '', '{displayName,ticketSubject,staffName,ticketsUrl}', 250),
('email:invite-signup', 'Signup / welcome email', 'Sent to a new member when they sign up or are invited.', 'Emails', 'email', 'Welcome to BM Support', '', '{displayName,link}', 260),
('email:subscription-expiry-reminder', 'Subscription expiry reminder', 'Sent before a subscription runs out.', 'Emails', 'email', 'Your BM Support subscription is due to expire', '', '{displayName,expiresOn}', 270),
('email:twofa-reset-user', 'Two-factor reset (member)', 'Sent to the member when their two-factor login is reset.', 'Emails', 'email', 'Your two-factor login has been reset', '', '{displayName}', 280),
('email:twofa-reset-admin', 'Two-factor reset (admin alert)', 'Sent to admin when a member requests a two-factor reset.', 'Emails', 'email', 'Two-factor reset requested', '', '{displayName}', 290),
('email:vault-pin-reset', 'Vault PIN reset', 'Sent when a vault PIN is reset.', 'Emails', 'email', 'Your vault PIN has been reset', '', '{displayName,pin}', 300),
('email:screen-lock-reset', 'Screen lock reset', 'Sent when a screen lock code is reset.', 'Emails', 'email', 'Your screen lock code has been reset', '', '{displayName,code}', 310),
('email:wc-guest-pin-reset', 'Predictions guest PIN reset', 'Sent when a predictions guest PIN is reset.', 'Emails', 'email', 'Your predictions PIN has been reset', '', '{displayName,pin}', 320),
('email:wc-prediction-reminder', 'World Cup predictions reminder', 'Reminder to put predictions in before kick-off.', 'Emails', 'email', 'Get your World Cup predictions in', '', '{displayName,deadline}', 330),
('email:boro-prediction-reminder', 'Boro predictions reminder', 'Reminder to put Boro predictions in.', 'Emails', 'email', 'Get your Boro prediction in', '', '{displayName,deadline}', 340),
('email:boro-prediction-final-reminder', 'Boro predictions final reminder', 'Last-chance Boro predictions reminder.', 'Emails', 'email', 'Last chance — Boro prediction deadline', '', '{displayName,deadline}', 350),
('email:boro-predictor-invite', 'Boro predictor invite', 'Invite to join the Boro predictions game.', 'Emails', 'email', 'Join the Boro predictor', '', '{displayName,link}', 360),
('email:fantasy-squad-reminder', 'Fantasy squad reminder', 'Reminder to pick a fantasy squad.', 'Emails', 'email', 'Pick your fantasy squad', '', '{displayName,deadline}', 370),
('email:fantasy-squad-final-reminder', 'Fantasy squad final reminder', 'Last-chance fantasy squad reminder.', 'Emails', 'email', 'Last chance — fantasy squad deadline', '', '{displayName,deadline}', 380),
('email:winner-notification', 'Competition winner', 'Sent to competition winners.', 'Emails', 'email', '🏆 You''ve won!', '', '{displayName,prize}', 390);