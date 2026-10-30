package uk.bmsupport.directinstall;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputFilter;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * BM Direct Install — runs on the TV. PIN sign-in, website code, then installs the ticked apps with
 * Android's own installer (the customer presses Install for each). Install only: no screen sharing.
 */
public class MainActivity extends Activity {
    private static final String SITE = "https://bmsupport.uk/api/public/";
    private static final String ACTION = "uk.bmsupport.directinstall.INSTALL_RESULT";
    private static final int BG = Color.rgb(18, 24, 38), CARD = Color.rgb(29, 37, 56), FG = Color.rgb(244, 246, 251),
            MUTED = Color.rgb(184, 192, 212), ACCENT = Color.rgb(226, 59, 74), OK = Color.rgb(46, 196, 120);

    private SharedPreferences prefs;
    private LinearLayout box;
    private final LinkedBlockingQueue<Integer> results = new LinkedBlockingQueue<>();
    private volatile boolean busy;
    private Set<String> pendingPaths;

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            int status = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
            if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                Intent confirm = i.getParcelableExtra(Intent.EXTRA_INTENT);
                if (confirm != null) { confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); try { startActivity(confirm); return; } catch (Exception ignored) {} }
                results.offer(PackageInstaller.STATUS_FAILURE);
                return;
            }
            results.offer(status);
        }
    };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("direct", MODE_PRIVATE);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        ImageView bg = new ImageView(this);
        bg.setImageResource(R.drawable.install_bg); bg.setScaleType(ImageView.ScaleType.CENTER_CROP); bg.setAlpha(0.25f);
        root.addView(bg, new FrameLayout.LayoutParams(-1, -1));
        ScrollView sv = new ScrollView(this);
        box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        box.setPadding(dp(48), dp(36), dp(48), dp(36));
        sv.addView(box);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(720), -2, Gravity.CENTER);
        root.addView(sv, lp);
        setContentView(root);
        IntentFilter f = new IntentFilter(ACTION);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(receiver, f, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(receiver, f);
        if (validToken()) showCode(null); else showPin(null);
    }

    @Override protected void onDestroy() { try { unregisterReceiver(receiver); } catch (Exception ignored) {} super.onDestroy(); }

    @Override protected void onResume() {
        super.onResume();
        // Back from the "Install unknown apps" setting: continue automatically.
        if (pendingPaths != null && !busy && canInstall()) { Set<String> p = pendingPaths; pendingPaths = null; startInstall(p); }
    }

    private boolean validToken() {
        String t = prefs.getString("token", "");
        return t.matches("[0-9a-fA-F]{20,200}") && prefs.getLong("exp", 0) > System.currentTimeMillis();
    }

    // ---------- Screens ----------
    private void header(String title, String body) {
        box.removeAllViews();
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.bm_logo); logo.setAdjustViewBounds(true);
        box.addView(logo, new LinearLayout.LayoutParams(dp(150), dp(80)));
        box.addView(text("BM Direct Install", 15, MUTED, false), lp(dp(4)));
        box.addView(text(title, 30, FG, true), lp(dp(14)));
        if (body != null) box.addView(text(body, 18, MUTED, false), lp(dp(10)));
    }

    private void showPin(String error) {
        header("Sign in", "Type your BM TV Enabler PIN. You'll find it on bmsupport.uk › Install Guides › BM Direct Install.");
        EditText pin = input("6-digit PIN", 6);
        box.addView(pin, inputLp());
        TextView msg = text(error == null ? "" : error, 17, ACCENT, false); box.addView(msg, lp(dp(8)));
        Button go = button("Sign in", ACCENT); box.addView(go, btnLp());
        go.setOnClickListener(v -> {
            String p = pin.getText().toString().trim();
            if (!p.matches("\\d{6}")) { msg.setText("Type the 6-digit PIN."); return; }
            go.setEnabled(false); msg.setTextColor(MUTED); msg.setText("Checking your PIN…");
            new Thread(() -> {
                try {
                    JSONObject j = post("enabler-login", new JSONObject().put("pin", p).put("app", "direct-1.0"), false);
                    prefs.edit().putString("token", j.getString("token")).putLong("exp", j.optLong("expiresAtMs", System.currentTimeMillis() + 3600_000L)).apply();
                    runOnUiThread(() -> showCode(null));
                } catch (Exception e) { runOnUiThread(() -> showPin(e.getMessage())); }
            }).start();
        });
        pin.requestFocus();
    }

    private void showCode(String error) {
        header("Enter your website code", "On bmsupport.uk › Install Guides, choose your TV, tick your apps and press Get my website code.");
        EditText code = input("6-digit website code", 7);
        box.addView(code, inputLp());
        TextView msg = text(error == null ? "" : error, 17, ACCENT, false); box.addView(msg, lp(dp(8)));
        Button go = button("Continue", ACCENT); box.addView(go, btnLp());
        Button out = button("Sign out", CARD); box.addView(out, btnLp());
        out.setOnClickListener(v -> { prefs.edit().clear().apply(); showPin(null); });
        go.setOnClickListener(v -> {
            String c = code.getText().toString().replaceAll("\\D", "");
            if (c.length() != 6) { msg.setText("Type the 6-digit code from the website."); return; }
            go.setEnabled(false); msg.setTextColor(MUTED); msg.setText("Checking your code…");
            new Thread(() -> {
                try {
                    JSONObject r = post("enabler-handoff", new JSONObject().put("code", c).put("protocol", 2).put("installOnly", true), true);
                    Set<String> paths = new HashSet<>();
                    JSONArray a = r.optJSONArray("apps");
                    if (a != null) for (int i = 0; i < a.length(); i++) paths.add(a.optString(i));
                    runOnUiThread(() -> startInstall(paths));
                } catch (AuthException e) {
                    prefs.edit().clear().apply(); runOnUiThread(() -> showPin(e.getMessage()));
                } catch (Exception e) { runOnUiThread(() -> showCode(e.getMessage())); }
            }).start();
        });
        code.requestFocus();
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls();
    }

    private void showPermission(Set<String> paths) {
        pendingPaths = paths;
        header("Allow BM Direct Install to install apps", "Your TV needs your OK once. On the next screen switch BM Direct Install ON, then press Back to return here.");
        Button go = button("Open setting", ACCENT); box.addView(go, btnLp());
        go.setOnClickListener(v -> {
            try { startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); }
            catch (Exception e) { try { startActivity(new Intent(Settings.ACTION_SECURITY_SETTINGS)); } catch (Exception ignored) {} }
        });
        go.requestFocus();
    }

    private TextView progTitle, progDetail, progCount; private ProgressBar bar;

    private void startInstall(Set<String> paths) {
        if (!canInstall()) { showPermission(paths); return; }
        busy = true;
        header("Installing your apps", "Please don't turn off your TV. When asked, press Install.");
        progTitle = text("Getting ready…", 22, FG, true); box.addView(progTitle, lp(dp(18)));
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal); bar.setMax(100);
        box.addView(bar, new LinearLayout.LayoutParams(-1, dp(14)) {{ topMargin = dp(12); }});
        progCount = text("", 16, MUTED, false); box.addView(progCount, lp(dp(6)));
        progDetail = text("", 16, MUTED, false); box.addView(progDetail, lp(dp(6)));
        new Thread(() -> runInstall(paths)).start();
    }

    private void progress(String title, String count, int pct) {
        runOnUiThread(() -> { progTitle.setText(title); progCount.setText(count); bar.setProgress(pct); });
    }

    private void runInstall(Set<String> paths) {
        List<String> done = new ArrayList<>(), failed = new ArrayList<>();
        try {
            JSONArray all;
            try (Get g = get(SITE + "tv-install-list", false)) { all = new JSONObject(g.text()).optJSONArray("apps"); }
            List<JSONObject> apps = new ArrayList<>();
            if (all != null) for (int i = 0; i < all.length(); i++) {
                JSONObject a = all.optJSONObject(i);
                if (a == null || !a.optString("path").startsWith("/api/public/tv-install-apk/")) continue;
                if (paths.isEmpty() || paths.contains(a.optString("path"))) apps.add(a);
            }
            if (apps.isEmpty()) throw new IllegalStateException("No apps to install for this code. Make a new code on the website.");
            int total = apps.size();
            for (int i = 0; i < total; i++) {
                JSONObject a = apps.get(i);
                String name = clean(a.optString("name", "App"));
                String count = "App " + (i + 1) + " of " + total;
                int pct = (i * 100) / total;
                if (installed(a.optString("packageName", ""))) {
                    progress(name + " — already installed", count, ((i + 1) * 100) / total);
                    done.add(name); continue;
                }
                progress("Downloading " + name, count, pct);
                File apk = new File(getCacheDir(), "bm-app.apk");
                try (Get g = get("https://bmsupport.uk" + a.optString("path"), true); OutputStream o = new FileOutputStream(apk)) {
                    byte[] buf = new byte[65536]; int r; InputStream in = g.in;
                    while ((r = in.read(buf)) > 0) o.write(buf, 0, r);
                }
                progress("Installing " + name + " — press Install", count, pct);
                if (install(apk)) done.add(name); else failed.add(name);
                apk.delete();
            }
            try { post("enabler-self-install", new JSONObject().put("apps", new JSONArray(done)), true); } catch (Exception ignored) {}
            runOnUiThread(() -> showDone(done, failed));
        } catch (Exception e) {
            String m = e.getMessage() == null ? "Something went wrong." : e.getMessage();
            if (!done.isEmpty()) { try { post("enabler-self-install", new JSONObject().put("apps", new JSONArray(done)), true); } catch (Exception ignored) {} }
            runOnUiThread(() -> { busy = false; showCode(m); });
        }
    }

    private boolean installed(String pkg) {
        if (pkg == null || !pkg.matches("[A-Za-z][\\w]*(\\.[A-Za-z_][\\w]*)+")) return false;
        try { return getPackageManager().getApplicationInfo(pkg, 0).enabled; }
        catch (PackageManager.NameNotFoundException e) { return false; }
    }

    /** One PackageInstaller session; blocks until Android reports the result (customer presses Install). */
    private boolean install(File apk) throws Exception {
        results.clear();
        PackageInstaller pi = getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams sp = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        int id = pi.createSession(sp);
        try (PackageInstaller.Session s = pi.openSession(id)) {
            try (InputStream in = new FileInputStream(apk); OutputStream out = s.openWrite("app", 0, apk.length())) {
                byte[] buf = new byte[65536]; int r;
                while ((r = in.read(buf)) > 0) out.write(buf, 0, r);
                s.fsync(out);
            }
            Intent cb = new Intent(ACTION).setPackage(getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            s.commit(PendingIntent.getBroadcast(this, id, cb, flags).getIntentSender());
        }
        Integer st = results.poll(10, TimeUnit.MINUTES);
        return st != null && st == PackageInstaller.STATUS_SUCCESS;
    }

    private void showDone(List<String> done, List<String> failed) {
        busy = false;
        header(failed.isEmpty() ? "Installation complete" : "Installation finished", null);
        TextView tick = text("\u2714", 64, OK, true); box.addView(tick, lp(dp(8)));
        for (String n : done) box.addView(text("\u2714  " + n, 19, FG, false), lp(dp(6)));
        for (String n : failed) box.addView(text("\u2716  " + n + " — not installed", 19, ACCENT, false), lp(dp(6)));
        if (!failed.isEmpty()) box.addView(text("Make a new code on the website to try the missing apps again.", 16, MUTED, false), lp(dp(10)));
        Button close = button("Close", ACCENT); box.addView(close, btnLp());
        close.setOnClickListener(v -> finishAndRemoveTask());
        Button again = button("Enter another code", CARD); box.addView(again, btnLp());
        again.setOnClickListener(v -> showCode(null));
        close.requestFocus();
    }

    // ---------- Network ----------
    static final class AuthException extends Exception { AuthException(String m) { super(m); } }

    private JSONObject post(String route, JSONObject body, boolean auth) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(SITE + route).openConnection();
        h.setRequestMethod("POST"); h.setDoOutput(true); h.setConnectTimeout(15000); h.setReadTimeout(20000);
        h.setRequestProperty("Content-Type", "application/json");
        if (auth) h.setRequestProperty("x-enabler-token", prefs.getString("token", ""));
        int code; String resp;
        try {
            try (OutputStream o = h.getOutputStream()) { o.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            code = h.getResponseCode();
            InputStream in = code < 400 ? h.getInputStream() : h.getErrorStream();
            resp = in == null ? "" : read(in);
        } catch (Exception e) { throw new IllegalStateException("Couldn't reach bmsupport.uk. Check the TV's internet and try again."); }
        finally { h.disconnect(); }
        JSONObject j; try { j = new JSONObject(resp); } catch (Exception e) { j = new JSONObject(); }
        if (code == 401 && auth) throw new AuthException(j.optString("error", "Please sign in again."));
        if (code != 200) throw new IllegalStateException(j.optString("error", "BM Support couldn't answer (error " + code + "). Try again."));
        return j;
    }

    private final class Get implements AutoCloseable {
        final HttpURLConnection h; final InputStream in;
        Get(HttpURLConnection h, InputStream in) { this.h = h; this.in = in; }
        String text() throws Exception { return read(in); }
        @Override public void close() { try { in.close(); } catch (Exception ignored) {} h.disconnect(); }
    }

    private Get get(String url, boolean auth) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(15000); h.setReadTimeout(120000);
        if (auth) h.setRequestProperty("x-enabler-token", prefs.getString("token", ""));
        try {
            if (h.getResponseCode() != 200) throw new IllegalStateException("Download failed (error " + h.getResponseCode() + "). Try again.");
            return new Get(h, h.getInputStream());
        } catch (IllegalStateException e) { h.disconnect(); throw e; }
        catch (Exception e) { h.disconnect(); throw new IllegalStateException("Couldn't reach bmsupport.uk. Check the TV's internet and try again."); }
    }

    private static String read(InputStream in) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int r;
        while ((r = in.read(buf)) > 0) b.write(buf, 0, r);
        return b.toString("UTF-8");
    }

    private static String clean(String s) {
        String t = s == null ? "" : s.replaceAll("[^\\p{L}\\p{N} .,'()&+\\-]", "").trim();
        return t.length() > 80 ? t.substring(0, 80) : t;
    }

    // ---------- Views ----------
    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
    private LinearLayout.LayoutParams lp(int top) { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2); p.topMargin = top; return p; }
    private LinearLayout.LayoutParams inputLp() { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(dp(360), -2); p.topMargin = dp(22); return p; }
    private LinearLayout.LayoutParams btnLp() { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(dp(300), -2); p.topMargin = dp(14); return p; }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(color); t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private EditText input(String hint, int max) {
        EditText e = new EditText(this);
        e.setHint(hint); e.setHintTextColor(MUTED); e.setTextColor(FG); e.setTextSize(26); e.setGravity(Gravity.CENTER);
        e.setInputType(InputType.TYPE_CLASS_NUMBER); e.setFilters(new InputFilter[]{ new InputFilter.LengthFilter(max) });
        e.setSingleLine(true);
        if (Build.VERSION.SDK_INT >= 26) e.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        GradientDrawable d = new GradientDrawable(); d.setColor(CARD); d.setCornerRadius(dp(10)); d.setStroke(dp(2), MUTED);
        e.setBackground(d); e.setPadding(dp(16), dp(12), dp(16), dp(12));
        e.setOnFocusChangeListener((v, f) -> d.setStroke(dp(f ? 4 : 2), f ? ACCENT : MUTED));
        return e;
    }

    private Button button(String label, int color) {
        Button b = new Button(this); b.setText(label); b.setTextColor(Color.WHITE); b.setTextSize(19); b.setAllCaps(false);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(dp(12));
        b.setBackground(d); b.setFocusable(true);
        // Clear D-pad focus ring: white border when focused.
        b.setOnFocusChangeListener((v, f) -> { d.setStroke(f ? dp(4) : 0, Color.WHITE); v.setScaleX(f ? 1.05f : 1f); v.setScaleY(f ? 1.05f : 1f); });
        return b;
    }
}
