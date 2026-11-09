# BM Player backup codes: allow pasting the password and give them their own tab

## 1. Let the password be pasted
- The password box itself doesn't block pasting. But the site blocks the right-click menu for everyone except admins, and on phones and tablets that same block also stops the long-press "Paste" menu.
- Change: right-click and long-press stay blocked on the rest of the page, but work as normal inside any typing box (password, text and search boxes). This lets you paste into them.
- The cause isn't confirmed yet. Before changing anything, I'll test pasting with Ctrl+V, right-click and long-press. If something else is blocking it, I'll fix that instead.

## 2. Separate "BM Player 2FA" tab
- The Security settings tabs become: **Two-factor** (website sign-in only), **BM Player 2FA**, **Screen lock**, **Privacy**.
- The new tab has the player 2FA status ("on" / "not set up"), the locked backup codes box, and a short note that these codes only unlock the BM Player apps, not website sign-in.
- The backup codes box is removed from the website Two-factor tab, so the two are no longer mixed up.
- The same tabs appear in every place that shows Security settings (account security, Fan Zone security and portal settings).

## Technical details
- `src/routes/__root.tsx` RightClickGuard: return early when `e.target` is inside `input, textarea, [contenteditable]`.
- `src/components/app/AccountSecurityView.tsx`: add a `"player"` tab key and move `<PlayerBackupCodesCard />` there, along with the player 2FA status (reusing the `PlayerPinButton` status) and the explanatory note.
- Check with Playwright as a signed-in non-admin: paste into the password box, unlock the codes, and switch tabs.
