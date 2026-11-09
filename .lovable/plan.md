# BM Player first-open link code pop-up

## What the customer sees
1. On first open (fresh install or after logging out / clearing data), BM Player shows a pop-up with a large 6-digit code and the text "Go to bmsupport.uk › Link Device and enter this code".
2. On the website, the signed-in customer opens Link Device, types the code, picks which saved login to use and presses Link.
3. The box links to that account straight away, gets its login and opens. It stays signed in, with no account number or approval needed again, until the customer logs out or clears the app's data.
4. Customers without a website account read the code to staff, and an admin enters it in **BM Player › Link non-website customer** (already in the preview).

## One person looking after several accounts
Every account is now separate, so the code always links the box to whichever website account is signed in when the code is typed. Someone who manages several accounts signs in to the right one first, then enters the code. A line above the code box makes this clear: "This box will be linked to: <account name / number>". A box can't end up on the wrong account without the person seeing which account it's going to.

## Rules
- Codes are single-use and run out after 10 minutes. The pop-up shows a new code automatically when the old one runs out.
- A code can only link to the account of the person who enters it. Admins can link codes for non-website customers.
- On a box that's already linked, opening the app no longer asks for the account number. The approval and account-number screen only appears again after logout or a data clear.
- Number entry stays as a hidden backup ("Use account number instead").

## Technical details
- Reuse the existing pairing-code path that the website's "Send to code" button already uses, which ties the device to the owner. Website change: on Link Device, make the code box the main action, labelled "Enter the code shown on your BM Player".
- Android, Windows and Mac: put the existing no-login link-code screen in a modal pop-up and poll for the linked login. Keep the saved linked state so later opens skip the unlock gate.
- Bump versions to Android 4.08, Windows 0.4.50 and Mac 0.1.60 (or the next ones), then build, test, upload, register the builds as current and publish.
