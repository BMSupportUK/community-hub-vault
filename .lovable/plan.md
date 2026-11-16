# BM Player themes (design approval first)

## Step 1 - picture mock-ups for approval (nothing in the app changes yet)
For each theme I make one picture of the BM Player home screen (header search pills, tile row, Sports / Multi-screen / Favourites / Recently watched / Settings row) in that theme. They are saved to Files so you can approve or reject each one.

Football themes use club colours with original patterns (stripes, pitch lines, stadium lights). They do not use official badges, crests or sponsor logos, because those are trademarked.
- Middlesbrough (red/white), Man Utd, Liverpool, Arsenal, Chelsea, Man City, Spurs
- Newcastle, Sunderland, Leeds, Aston Villa
- England (white/navy/red, Three Lions-style roar pattern, no FA crest)

Kids and family
- Kids Cartoon (bright, bubbly, rounded tiles)
- Fairy-tale Magic (castle, starry sky, sparkles, Disney-inspired but original, no Disney characters)

Holidays
- Christmas, Halloween, Valentine's, Easter, Bonfire Night, New Year

Mood
- Cinema (red curtain/gold), Neon Night, Midnight Dark

That makes 26 mock-ups, built in batches of 4.

## Step 2 - after you approve (a separate step)
- Add a Theme picker to Settings. The current navy theme stays the default.
- Approved themes change colours, the focus ring, backgrounds and tile styling, with the same layout and the same remote navigation.
- The choice is saved on the box. Android/Amazon, Windows and Mac will match, following the rule that every screen mirrors across apps.
- Publish the new versions only when you ask.

## Technical notes
- Images are generated with the premium image model and saved in /mnt/documents/bm-player-themes/.
- Each theme becomes a token set: background, surface, accent, focus, text and pattern image.
