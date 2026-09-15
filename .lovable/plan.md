# Grouped Sports Guide categories

Turn the category list into two levels: a main heading you click to open its
sub-categories. Football becomes one heading holding Mens, Mens International,
Women and Womens International, and admins can group any other categories the
same way (for example Rugby holding League and Union).

Nothing is moved or deleted — each existing category keeps its own guides and
its own sub-lists (England Leagues, FIFA, UEFA and so on), so the menu gains a
level rather than losing detail.

## What it looks like

```text
Categories
  Daily Sports & PPV
  Boxing, MMA & UFC
  Football                       <- heading, click to open/close
      Mens
      Mens International
      Women
      Womens International
  Rugby
      Rugby League
      Rugby Union
```

- Clicking a heading opens or closes its list; it does not show guides itself.
- Clicking a category underneath works exactly as it does today, including its
  sub-list chips, unread counts and the scroll-to-top behaviour.
- If the open guide sits inside a group, that group opens automatically so the
  card is visible when returning from editing or reading.
- Only headings with children collapse; ungrouped categories stay as they are.
- The Categories tab and the guide editor's category picker show the same
  grouping, with children listed under their heading.

## Admin controls

On the Categories tab, each category gets a "Group under" choice: none, or any
existing top-level category. Setting Football | Mens, Mens International, Women
and Womens International to sit under a new "Football" heading is then a few
clicks, and their long names can be shortened to Mens, Women, etc.

Existing add, rename, delete and drag-to-reorder controls keep working:
reordering applies within a heading's own list, and deleting a heading leaves
its children as normal top-level categories rather than removing any guides.

## Technical notes

- Migration: add `parent_id uuid references public.sports_categories(id) on delete set null`
  to `public.sports_categories`, plus an index on `(parent_id, sort_order)`. A
  trigger blocks a category being its own parent and blocks a second level of
  nesting (a category with a parent cannot itself be a parent), keeping the menu
  exactly two deep. Existing RLS/grants are unchanged.
- Data step (separate, after the schema change): create the "Football" heading
  and point the four football categories at it, keeping their current sort order.
- `src/routes/_authenticated/_approved/sports-guides.tsx`: build a
  parent/children tree from the loaded categories; render the sidebar and
  Categories tab from it with expand/collapse state (remembered in
  sessionStorage alongside the existing active-category key); auto-expand the
  group containing `activeCat`; keep `daily-sports-ppv` as the default landing
  category and keep `scrollCardsToTop()` on selection.
- `src/components/app/SportsGuideEditor.tsx` and
  `sports-guides.read.$id.tsx`: category dropdowns list only leaf categories,
  indented under their heading label.
