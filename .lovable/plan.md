# Fix the Sports Guides rail reset

## What will change

- Replace the temporary, immediately-cleared Welcome query with a persistent rail-reset key so the Sports Guides page cannot restore the previously selected category after the click.
- Make the rail action clear every navigation state used by the guide: selected category, subcategory, open category branch, search, dialogs, and scroll position.
- Keep normal guide navigation unchanged: opening a guide and using “Back to guides” will still return to that guide’s category.

## Verification

- Sign in and navigate through the real USA Sports path until the Baseball guide/list is visibly open.
- Click the Sports Guides icon in the side rail and confirm the Welcome screen replaces Baseball immediately and remains there after waiting.
- Repeat from an opened Baseball guide, from another category, and by clicking the already-active rail icon.
- Test at the current 827×855 viewport and a desktop viewport, then confirm the app builds cleanly.

## Technical detail

The rail currently sends a reset query, but the page immediately removes it. That allows other category-restoration effects to run against the same mounted page. The reset marker will remain authoritative for that navigation and category-restoration logic will be explicitly disabled while it is present.
