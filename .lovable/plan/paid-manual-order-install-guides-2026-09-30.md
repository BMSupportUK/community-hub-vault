# Paid manual-order install guides

## Build
- Add an install-guide card directly below the paid confirmation on every paid manual-order checkout, using the existing sofa/TV illustration and a clear **Open install guides** button.
- Add a checkout-only install-guide page that works without an account but requires the same unique manual-order link and password already used to open that paid order.
- Verify the order is manual, paid, and not cancelled before returning published guide content; reject direct or expired/incorrect checkout access.
- Keep guide files and videos protected through checkout-authorized server calls rather than exposing storage links.
- Preserve the existing signed-in Install Guides page and its member/admin behaviour.

## User flow
1. Customer opens their password-protected manual-order checkout.
2. Once paid, the install card appears beneath the paid message.
3. The button opens install guides for that specific order without asking for the password again in the same browser session.
4. Direct access without the paid order credentials returns the customer to their secure checkout.

## Validation
- Check paid versus unpaid and manual versus member orders.
- Check refresh and direct-link behaviour.
- Check desktop and phone layouts, guide opening, and error/build logs.
