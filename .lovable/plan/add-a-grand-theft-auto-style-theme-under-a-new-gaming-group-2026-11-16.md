# Add a "Grand Theft Auto" style theme under a new Gaming group

## What you'll get
- A new theme called "Grand Theft Auto" in a new **Gaming** group in BM Player (boxes, Windows, Mac), showing up automatically with no app update.
- An original digital illustration in the GTA look: sunset city skyline with palm trees, neon lights, a sports car on a coastal road, bold orange/pink/purple sky.
- Middle of the picture kept lighter so the home tiles stay readable, like the other themes.

## Note on the picture
The real Grand Theft Auto logo and game artwork belong to Rockstar Games, so the picture will be an original artwork in that style, with no official logo, characters or text.

## Steps
1. Generate the 1920x1080 picture, compress it like the other themes and add it with the theme pictures.
2. Add the theme to the list under group "Gaming" with a pink/neon accent colour not already used.
3. Publish the website and confirm the picture loads and the theme appears in the list the apps read.

## Technical details
- File: `public/player-themes/gta-v1.jpg` (quality ~84).
- Insert `player_themes` row: id gen_random_uuid(), name "Grand Theft Auto", grp "Gaming", sort 70, enabled true, accent #EC4899.
- Verify via the `themes` action on `/api/public/player`.
