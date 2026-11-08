package uk.bmsupport.player;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;

/** Both playback engines use the same action row, report dialog and channel-switch flow. */
final class PlayerActionControls {
    private PlayerActionControls() {}
    static String kind(Activity a) { String k = a.getIntent().getStringExtra("content_kind"); return k == null ? "live" : k; }
    static LinearLayout add(Activity a, FrameLayout root, Runnable boostChanged, Runnable report, Runnable swap) {
        LinearLayout row = new LinearLayout(a); row.setOrientation(LinearLayout.HORIZONTAL);
        Button boost = button(a, "🔊 Sound booster: " + SoundBoost.label(a));
        boost.setOnClickListener(v -> {
            String id = SoundBoost.next(SoundBoost.current(a)); SoundBoost.set(a, id); boostChanged.run();
            boost.setText("🔊 Sound booster: " + SoundBoost.label(a));
            Toast.makeText(a, "Sound booster: " + SoundBoost.label(a) + ("high".equals(id) ? "\n" + SoundBoost.HIGH_NOTE : ""), Toast.LENGTH_SHORT).show();
        });
        row.addView(boost);
        Button reportButton = button(a, "⚠ Report a problem"); reportButton.setOnClickListener(v -> report.run());
        Button swapButton = button(a, "⇄ Swap channel"); swapButton.setOnClickListener(v -> swap.run());
        for (Button b : new Button[]{reportButton, swapButton}) {
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, -2); p.leftMargin = (int)(12 * a.getResources().getDisplayMetrics().density); row.addView(b, p);
        }
        reportButton.setVisibility(PlayerControls.canReport(kind(a)) ? View.VISIBLE : View.GONE);
        swapButton.setVisibility("live".equals(kind(a)) && !a.getIntent().hasExtra("catchup_prefix") ? View.VISIBLE : View.GONE);
        FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.START);
        p.bottomMargin = (int)(84 * a.getResources().getDisplayMetrics().density); p.leftMargin = 24;
        root.addView(row, p); return row;
    }
    static Button button(Activity a, String text) {
        Button b = new Button(a); b.setAllCaps(false); b.setText(text);
        float d = a.getResources().getDisplayMetrics().density;
        android.graphics.drawable.GradientDrawable normal = new android.graphics.drawable.GradientDrawable();
        normal.setColor(0xB30B1220); normal.setCornerRadius(12*d);
        android.graphics.drawable.GradientDrawable focused = new android.graphics.drawable.GradientDrawable();
        focused.setColor(0xB30B1220); focused.setCornerRadius(12*d); focused.setStroke((int)(3*d), 0xFFFBBF24);
        b.setBackground(normal); b.setTextColor(0xFFFFFFFF); b.setOnFocusChangeListener((v, has) -> v.setBackground(has ? focused : normal)); return b;
    }
    static void report(Activity a) {
        String title = a.getIntent().getStringExtra("content_name"); if (title == null) title = "";
        String rk = a.getIntent().getStringExtra("report_kind");
        String kind = rk != null ? rk : "live".equals(kind(a)) ? "live" : "film".equals(kind(a)) ? "film" : "series";
        String cat = a.getIntent().getStringExtra("report_category");
        PlayerActivity.ReportBox rb = PlayerActivity.buildReportBox(a, title, kind, cat);
        AlertDialog dialog = new AlertDialog.Builder(a).setView(rb.box).create();
        rb.cancel.setOnClickListener(v -> dialog.dismiss());
        rb.issue.setOnEditorActionListener((tv, action, e) -> { if (action == android.view.inputmethod.EditorInfo.IME_ACTION_SEND) { rb.send.performClick(); return true; } return false; });
        final String finalTitle = title;
        rb.send.setOnClickListener(v -> {
            String msg = rb.issue.getText().toString().trim();
            if (msg.length() < 3) { rb.issue.setError("Please type a short description"); return; }
            v.setEnabled(false);
            String token = PlayerActivity.prefs(a).getString("token", "");
            new Thread(() -> {
                String error = null;
                try {
                    JSONObject body = new JSONObject().put("action", "report").put("device_token", token).put("kind", kind)
                        .put("title", finalTitle).put("issue", msg).put("device", String.valueOf(a.getIntent().getStringExtra("report_device")))
                        .put("version", String.valueOf(a.getIntent().getStringExtra("report_version")));
                    if (cat != null && !cat.isEmpty()) body.put("category", cat);
                    Net.postJson(Net.SITE + "/api/public/player", body.toString());
                } catch (Exception e) {
                    String m = String.valueOf(e.getMessage()); int i = m.indexOf("\"error\":\"");
                    error = i >= 0 ? m.substring(i + 9, Math.max(i + 9, m.indexOf('"', i + 9))) : "Couldn't send your report. Check your internet and try again.";
                }
                String result = error;
                new Handler(Looper.getMainLooper()).post(() -> {
                    if (a.isFinishing()) return;
                    if (result != null) { rb.send.setEnabled(true); Toast.makeText(a, result, Toast.LENGTH_LONG).show(); return; }
                    dialog.dismiss(); Toast.makeText(a, "Thanks – a support ticket has been opened. You'll find replies at bmsupport.uk/tickets", Toast.LENGTH_LONG).show();
                });
            }).start();
        });
        dialog.show(); if (dialog.getWindow() != null) dialog.getWindow().setSoftInputMode(PlayerActivity.reportInputMode());
    }
    static void swap(Activity a, boolean auto, Runnable release) {
        JSONArray options;
        try { String raw = a.getIntent().getStringExtra("swap_options"); options = new JSONArray(raw == null ? "[]" : raw); } catch (Exception e) { options = new JSONArray(); }
        if (options.length() == 0) { if (!auto) Toast.makeText(a, "No other versions of this channel found", Toast.LENGTH_SHORT).show(); return; }
        final JSONArray choices = options;
        String[] names = new String[options.length()];
        for (int i=0;i<names.length;i++) names[i] = options.optJSONObject(i).optString("label", options.optJSONObject(i).optString("name"));
        new AlertDialog.Builder(a).setTitle(auto ? "This channel is struggling — swap to another?" : "Swap channel")
            .setItems(names, (dialog, index) -> {
                try {
                    JSONObject selected = choices.getJSONObject(index);
                    if (selected.optBoolean("down")) { Toast.makeText(a, "That channel is marked Not working — try another", Toast.LENGTH_SHORT).show(); return; }
                    JSONArray urls = selected.getJSONArray("urls"); if (urls.length() == 0) return;
                    String[] next = new String[urls.length()]; for (int j=0;j<next.length;j++) next[j]=urls.getString(j);
                    BufferReporter.swap(a, a.getIntent().getStringExtra("content_id"), a.getIntent().getStringExtra("content_name"), selected.getString("name"), auto ? "auto" : "manual", a.getIntent().getStringExtra("event_name"));
                    Intent intent = new Intent(a.getIntent()).setClass(a, PlayerActivity.class); intent.removeExtra("carried");
                    intent.putExtra("content_id", selected.getString("id")).putExtra("content_name", selected.getString("name"))
                        .putExtra("recovery_name", selected.getString("recovery_name")).putExtra("urls", next).putExtra("url", next[0]);
                    intent.removeExtra("sd_urls"); intent.removeExtra("sd_name"); release.run(); a.startActivity(intent); a.finish();
                } catch (Exception ignored) {}
            }).setNegativeButton("Keep watching", null).show();
    }
}