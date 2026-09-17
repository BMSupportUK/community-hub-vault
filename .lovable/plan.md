# Correct Fan Zone mutual friendships

## Changes
- Keep each accepted friend request as a one-way friendship.
- Mark two fans as mutual only when two accepted records exist: one in each direction.
- Allow the second fan to send their own request after accepting the first fan's request.
- Update profile counters, friend lists, forum add-friend icons, and the request inbox in real time.
- Repair Graham and DJ Boro's reciprocal records because both requests were already completed separately.

## Technical details
- Add a privacy-aware database function that returns directional accepted friends and calculates mutual status from the reverse accepted record.
- Update all friend-state queries so an accepted incoming record never masquerades as the viewer's outgoing friendship.
- Preserve hidden-friends privacy and owner-only removal controls.
- Verify the build and the stored Graham/DJ relationship after the changes.
