package uk.bmsupport.player;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;

/**
 * "Get VPN": the VPN is bought only inside BM Player. £2 a month, charged by the day up to the
 * subscription's end. The box shows a QR code for the customer's phone; phones get a Pay now button.
 * Once paid, the next VPN check finds it and the dialog says it's ready (the VPN still starts off).
 */
final class VpnBuyDialog {
    private VpnBuyDialog() { }

    static String price(int pence) { return String.format(java.util.Locale.UK, "£%d.%02d", pence / 100, pence % 100); }

    static String endDay(String iso) {
        try {
            java.text.SimpleDateFormat in = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.UK);
            in.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            java.util.Date d = in.parse(iso.length() >= 19 ? iso.substring(0, 19) : iso);
            java.text.SimpleDateFormat out = new java.text.SimpleDateFormat("d MMMM yyyy", java.util.Locale.UK);
            out.setTimeZone(java.util.TimeZone.getTimeZone("Europe/London"));
            return out.format(d);
        } catch (Exception e) { return ""; }
    }

    static void show(Activity a, String token, boolean phone, Runnable onReady) {
        new Thread(() -> {
            JSONObject q;
            try { q = new JSONObject(Net.postJson(Net.SITE + "/api/public/player", new JSONObject().put("action", "vpn_quote").put("device_token", token).toString())); }
            catch (Exception e) { q = null; }
            final JSONObject quote = q;
            a.runOnUiThread(() -> {
                if (a.isFinishing()) return;
                if (quote == null) { new AlertDialog.Builder(a).setTitle("Get VPN").setMessage("Couldn't reach BM Support. Check your internet and try again.").setPositiveButton("OK", null).show(); return; }
                if (!quote.optBoolean("ok")) { new AlertDialog.Builder(a).setTitle("Get VPN").setMessage(quote.optString("reason", "The VPN can't be added right now.")).setPositiveButton("OK", null).show(); return; }
                int pence = quote.optInt("pence"), days = quote.optInt("days");
                String msg = "Protect your streaming with the BM VPN, built into BM Player.\n\n"
                        + price(pence) + " for " + days + " day" + (days == 1 ? "" : "s") + " — £2 a month, charged by the day.\n"
                        + "Ends with your subscription on " + endDay(quote.optString("until")) + ".\n\n"
                        + "You'll pay on your phone by Pay by bank or card.";
                new AlertDialog.Builder(a).setTitle("🔐 Get VPN · " + price(pence))
                        .setMessage(msg)
                        .setPositiveButton(phone ? "Pay now" : "Pay with my phone", (d, w) -> pay(a, token, phone, onReady))
                        .setNegativeButton("Not now", null).show();
            });
        }).start();
    }

    private static void pay(Activity a, String token, boolean phone, Runnable onReady) {
        new Thread(() -> {
            JSONObject r;
            try { r = new JSONObject(Net.postJson(Net.SITE + "/api/public/player", new JSONObject().put("action", "vpn_buy").put("device_token", token).toString())); }
            catch (Exception e) { r = null; }
            final JSONObject res = r;
            a.runOnUiThread(() -> {
                if (a.isFinishing()) return;
                String url = res == null ? "" : res.optString("url", "");
                if (url.isEmpty()) {
                    new AlertDialog.Builder(a).setTitle("Get VPN").setMessage(res == null ? "Couldn't reach BM Support. Try again shortly." : res.optString("error", "Couldn't start the payment. Try again shortly.")).setPositiveButton("OK", null).show();
                    return;
                }
                float dd = a.getResources().getDisplayMetrics().density;
                LinearLayout box = new LinearLayout(a);
                box.setOrientation(LinearLayout.VERTICAL);
                box.setPadding((int) (24 * dd), (int) (12 * dd), (int) (24 * dd), 0);
                TextView t = new TextView(a);
                t.setTextSize(16);
                t.setText(phone ? "Finish paying " + price(res.optInt("pence")) + " in your browser. Come back here when it's done."
                        : "Scan this with your phone camera and pay " + price(res.optInt("pence")) + " by Pay by bank or card.");
                box.addView(t);
                if (!phone) {
                    ImageView qr = new ImageView(a);
                    qr.setImageBitmap(qr(url, (int) (220 * dd)));
                    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams((int) (220 * dd), (int) (220 * dd));
                    lp.topMargin = (int) (12 * dd);
                    lp.gravity = android.view.Gravity.CENTER_HORIZONTAL;
                    box.addView(qr, lp);
                }
                TextView wait = new TextView(a);
                wait.setTextSize(14);
                wait.setPadding(0, (int) (12 * dd), 0, 0);
                wait.setText("⏳ Waiting for your payment…");
                box.addView(wait);
                AlertDialog dlg = new AlertDialog.Builder(a).setTitle("🔐 Pay for your VPN").setView(box).setNegativeButton("Close", null).create();
                Handler h = new Handler(Looper.getMainLooper());
                final boolean[] open = {true};
                Runnable[] poll = new Runnable[1];
                poll[0] = () -> {
                    if (!open[0]) return;
                    new Thread(() -> {
                        BoxVpn.sync(a, token);
                        a.runOnUiThread(() -> {
                            if (!open[0]) return;
                            if (BoxVpn.present) {
                                wait.setText("✅ Paid — your VPN is ready. Press the VPN button on the home screen to switch it on.");
                                open[0] = false;
                                if (onReady != null) h.postDelayed(onReady, 4000);
                            } else h.postDelayed(poll[0], 5000);
                        });
                    }).start();
                };
                dlg.setOnDismissListener(d -> { open[0] = false; if (BoxVpn.present && onReady != null) onReady.run(); });
                dlg.show();
                h.postDelayed(poll[0], 5000);
                if (phone) {
                    try { a.startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))); }
                    catch (Exception e) { wait.setText("Open bmsupport.uk on another device to pay."); }
                }
            });
        }).start();
    }

    private static Bitmap qr(String text, int size) {
        try {
            com.google.zxing.common.BitMatrix m = new com.google.zxing.qrcode.QRCodeWriter().encode(text, com.google.zxing.BarcodeFormat.QR_CODE, size, size);
            Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565);
            for (int x = 0; x < size; x++) for (int y = 0; y < size; y++) b.setPixel(x, y, m.get(x, y) ? Color.BLACK : Color.WHITE);
            return b;
        } catch (Exception e) { return Bitmap.createBitmap(1, 1, Bitmap.Config.RGB_565); }
    }
}
