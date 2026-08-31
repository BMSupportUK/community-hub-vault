# Fix the blank "Get the App" tab and make the APK upload easy to find

## What's actually wrong

- No APK has been uploaded yet, and the member panel renders **nothing at all** when there is no build. So the tab looks broken instead of saying "not available yet".
- The upload form does exist, but it is buried at the bottom of **Install Guides → Passcodes**, not in the Admin Dashboard where you looked. Nothing on the page tells you that.

The database table, the private storage bucket and its access rules are all in place — only the UI is at fault.

## Changes

1. **Empty state on "Get the App"**
   - When no build is uploaded (or availability is toggled off): show a card explaining the app isn't published yet.
   - For admin/management viewing that state, add an "Upload the APK" button that jumps straight to the upload form.

2. **Give the upload its own tab**
   - Add an **App APK** tab (admin/management only) in Install Guides holding the upload form, version name, release notes, availability toggle and the live-transfer list, instead of hiding it under Passcodes.

3. **Admin Dashboard entry point**
   - Add an "App APK / transfers" link in the Admin Dashboard tools list that opens the new tab, so it's findable from where you expected it.

4. **Better upload feedback**
   - Show upload progress and surface the real error text if storage rejects the file, plus a note of the max file size, so a failed upload never looks like a silent no-op.

## Technical notes

- `src/components/app/AppTransferPanel.tsx`: replace `if (!build || !build.isAvailable) return null;` with an empty-state render; role check via the existing roles hook for the admin shortcut.
- `src/routes/_authenticated/_approved/install-guides.tsx`: new `app-apk` tab value, grid-cols count updated, `AppBuildAdmin` moved out of the passcodes tab; tab is deep-linkable via search param so the Admin Dashboard link and empty-state button can target it.
- Admin Dashboard route: add link entry to `/install-guides?tab=app-apk`.
- No schema, storage or policy changes needed.
