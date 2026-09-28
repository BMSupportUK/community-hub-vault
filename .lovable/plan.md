# Make snooker imports reliable and prevent repeat format regressions

- Correct the WST layout where each event title appears above a dual UK/ET time and shared numbered channels below it.
- Add permanent parser regression tests covering this exact snooker post and the established provider layouts already recorded for sports imports.
- Run the importer’s full safety check and round-trip check against the real queued snooker text, then confirm the saved guide shape remains stable.
- Record the WST layout as a permanent supported format so future changes must preserve it.
