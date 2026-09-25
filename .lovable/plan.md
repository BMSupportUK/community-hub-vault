# Fix merged DAZN imports

## What will change
- Make the saved guide use the same fully formatted result shown in the importer preview.
- Ignore isolated one-letter junk between a DAZN event title and its time/channel row.
- Repair the current DAZN draft so “Vienna – GCL Round 1” and its DAZN channel are paired correctly.
- Complete an obviously clipped DAZN channel suffix such as `DAZN 13 H` to `DAZN 13 HD`.

## Verification
- Run the real merged DAZN post through the parser and formatter.
- Confirm preview and saved output contain the same event count, titles, times, and channels.
- Check the repaired draft in the database and confirm the app still builds.
