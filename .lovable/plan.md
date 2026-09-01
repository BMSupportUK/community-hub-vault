Change the transfer link label in the Install Guides "Get the App" panel.

- In `src/components/app/AppTransferPanel.tsx`, line 172, replace the label text:
  - From: `Type this into Downloader on your Fire Stick`
  - To: `Type this into Downloader on your compatible streaming device`
- No other logic or UI changes are needed.
- Verify the preview on the Install Guides page shows the new label.