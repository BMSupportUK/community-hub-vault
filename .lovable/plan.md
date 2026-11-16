# BM Player themes (design approval first)

## Step 1 - picture mock-ups for approval (nothing in the app changes yet)
For each theme I make one picture of the BM Player home screen (header search pills, tile row, Sports / Multi-screen / Favourites / Recently watched / Settings row) in that theme. They are saved to Files so you can approve or reject each one.

Football themes use each club's own home stadium as the background picture, shown at night under floodlights, in club colours. Badges, crests and sponsor logos are left out because they are trademarked.
- Middlesbrough - Riverside Stadium
- Man Utd - Old Trafford; Liverpool - Anfield; Arsenal - Emirates Stadium
- Chelsea - Stamford Bridge; Man City - Etihad Stadium; Spurs - Tottenham Hotspur Stadium
- Newcastle - St James' Park; Sunderland - Stadium of Light
- Leeds - Elland Road; Aston Villa - Villa Park
- England - Wembley Stadium

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
- The stadium pictures are AI-made scenes of each ground, not licensed photos, so they look like the real ground but won't match it exactly.
- Images are generated with the premium image model and saved in /mnt/documents/bm-player-themes/.
- Each theme becomes a token set: background, surface, accent, focus, text and pattern image.
