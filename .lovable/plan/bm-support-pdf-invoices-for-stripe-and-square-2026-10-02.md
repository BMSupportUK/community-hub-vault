# BM Support PDF invoices for Stripe and Square

## Goal
Replace customer-facing Stripe and Square invoices/receipts with one BM Support PDF invoice. The PDF becomes available only after payment is confirmed.

## What will change

### 1. Stop sharing provider invoices and receipts
- Keep Stripe and Square as secure payment processors, but remove their hosted invoice/receipt links from customer pages, staff payment screens, order messages, and payment-confirmation messages.
- Retire the app paths that create and post Stripe or Square hosted invoices for these orders; card payment remains inside the existing secure checkout.
- Keep provider transaction IDs and payment status internally for reconciliation and support.
- Ensure new Stripe and Square payment requests do not ask the providers to email their own invoice or receipt to the customer.
- Preserve historic provider references internally, but do not display their links to customers.

### 2. Create the BM Support invoice PDF
- Upgrade the existing PDF generator into a polished BM Support invoice with a generated digital illustration header showing a person relaxing on a sofa watching TV.
- Show: BM Support business details, customer name, invoice/order number, order date, paid date, payment method, item descriptions, quantities, unit prices, subtotal, discount and code when applicable, final total, currency, paid status, and editable footer/contact/VAT details.
- Use the order reference as the stable invoice reference and name downloads clearly, for example `BM-Support-Invoice-MANUAL-695453.pdf`.
- Render long names, addresses, and multi-item orders safely across PDF pages.

### 3. Make invoices downloadable after payment only
- Add **Download invoice** to each paid order on the customer Orders page.
- Add the same button to the paid stage of the password-protected secure checkout page, including manual orders.
- Add the button to the staff secure-order view so staff can download the exact same invoice.
- Authorize downloads using either the signed-in order owner/staff role or the secure order token and password; unpaid and cancelled orders will not expose an invoice.

### 4. Add an Invoice template Owner Tool
- Add a dedicated **Invoice template** button under Owner Tools, matching the existing Theme and Header Links tools.
- Provide editable business name, email, address, VAT/company number, invoice heading, footer/thank-you wording, and a live PDF-style preview using sample order details.
- Save these values in the existing protected app settings system; currently only currency is stored and the PDF falls back to hardcoded BM Support branding.
- Keep the sofa/TV illustration as the consistent branded header while allowing the business wording beneath it to be managed.

### 5. Verification
- Confirm a paid Stripe order and a paid Square order both show the BM Support download button on Orders and secure checkout.
- Confirm an unpaid order has no invoice download.
- Download and visually inspect the generated PDF for the illustration, customer details, line items, discount, totals, page breaks, and readable typography.
- Confirm no provider invoice/receipt links remain visible or are added to new order messages.
- Recheck desktop and phone layouts and run the relevant payment/invoice tests.

## Technical details
- Reuse the installed `jsPDF` and `jspdf-autotable` packages rather than adding a second PDF system.
- Generate the illustration as a bundled project asset; no external image URL will be embedded in the invoice.
- Add authenticated server functions for template management and invoice data, plus a token/password-authorized invoice-data path for secure checkout.
- Keep provider payment IDs/statuses in `order_payments`; stop treating `receipt_url` or `order_invoices.public_url` as customer content.
- Use the existing `app_settings` table for the invoice template, so no new public table is required unless implementation reveals a missing audit requirement.
