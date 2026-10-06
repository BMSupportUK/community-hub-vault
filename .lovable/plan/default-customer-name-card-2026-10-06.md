# Default customer name card

## What will change
- Add one **Customer** name card using the existing slim staff-card dimensions and styling, with a clear person icon on the right.
- Make it the automatic default for all approved BM Support customers, including subscribers, expired customers, and customers with no explicit role.
- Exclude staff defaults, pending/rejected/banned accounts, and Boro Fan Zone-only accounts.
- Apply it to existing customers who currently have no name card, and to future customers when their BM Support access is approved.
- Never replace a name card the customer has selected themselves. Customers can still choose another card or remove the default from Edit profile.

## Technical details
- Add one private default customer name-card record and grant it only to qualifying customer accounts.
- Add database rules that grant and initially equip the card on approval/account changes, while preserving every non-default selection.
- Backfill qualifying existing customers with no equipped card.
- Add one transparent person icon to the shared name-card renderer, so Home, profiles, member lists, tickets, and Talk automatically use the same card without changing Talk-channel code.
- Keep the card’s responsive dimensions aligned with the established staff name-card sizes.

## Verification
- Check a current customer with no card receives the Customer card.
- Check an existing custom card remains unchanged.
- Check staff and Fan Zone-only accounts do not receive it.
- Check the card renders correctly in profile and one Talk/member-list surface on desktop and phone widths.
