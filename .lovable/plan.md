I’ll fix the sports guide card parser so ET works whether the source writes the timezone before or after the time.

Plan:
1. Update the sports guide paste normalizer to recognize time lines like `ET 7:00 PM`, `ET 19:45`, `7:00 PM ET`, and `19:45 ET` as valid event time rows.
2. Update the card rendering parser to detect leading timezone times, not just trailing timezone times, so one ET-only event does not get swallowed into the event title/channel text or break the card layout.
3. Keep existing GMT/default handling unchanged, including Flosports titles defaulting to ET when no timezone is shown.
4. Add a small local verification script/check for the exact cases: `ET 7:00 PM`, `7:00 PM ET`, `19:45 ET`, date heading plus ET event, and mixed GMT/ET events in one guide.