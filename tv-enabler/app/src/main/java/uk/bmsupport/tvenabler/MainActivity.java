package uk.bmsupport.tvenabler;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.wifi.WifiManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int BG = Color.parseColor("#0F1220"), FG = Color.WHITE, MUTED = Color.parseColor("#A9B0C7"),
            ACCENT = Color.parseColor("#E23B4E"), OK = Color.parseColor("#3CCB7F"), WARN = Color.parseColor("#F5C04A");
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final SetupWizard wizard = new SetupWizard();
    private EditText address, tvCodeInput;
    private Button showAgain;
    private final java.security.SecureRandom random = new java.security.SecureRandom();
    private TextView confirmCode;
    private long confirmExpiresAt;
    private String refreshToken, refreshHost;
    private boolean refreshBusy;
    private boolean confirmationUsed;
    // The install section gets its own reference, remembered for its 24-hour validity like the share one.
    private TextView installCodeView;
    private String installCodeText = "";
    private long installExpiresAt;
    private String installRefreshToken;
    private boolean installUsed;
    private final Runnable refreshTick = new Runnable() {
        public void run() {
            if (isFinishing() || isDestroyed()) return;
            if (!busy && !refreshBusy && hasWindowFocus()) {
                if (refreshToken != null && refreshToken.length() == 64 && refreshHost != null && System.currentTimeMillis() < confirmExpiresAt) {
                    final String token = refreshToken, host = refreshHost;
                    refreshBusy = true;
                    io.execute(() -> {
                        try {
                            boolean done = Enabler.refreshConnection(MainActivity.this, host, token, used -> ui.post(() -> {
                                if (!token.equals(refreshToken) || !used) return;
                                confirmationUsed = true;
                                getSharedPreferences("tv", MODE_PRIVATE).edit().putBoolean("confirmationUsed", true).apply();
                                render();
                            }));
                            if (done) ui.post(() -> say("✓ New TV connection sent. Press Connect on your ticket or order.", OK));
                        } catch (Exception e) { ui.post(() -> say(Enabler.friendly(e), WARN)); }
                        finally { ui.post(() -> refreshBusy = false); }
                    });
                } else if (installRefreshToken != null && installRefreshToken.length() == 64 && !installUsed && System.currentTimeMillis() < installExpiresAt) {
                    // The install reference only needs its usage check — renewals never apply to it.
                    final String token = installRefreshToken, host = address.getText().toString().trim();
                    if (SetupWizard.validHost(host)) {
                        refreshBusy = true;
                        io.execute(() -> {
                            try {
                                Enabler.refreshConnection(MainActivity.this, host, token, used -> ui.post(() -> {
                                    if (!token.equals(installRefreshToken) || !used) return;
                                    installUsed = true;
                                    getSharedPreferences("tv", MODE_PRIVATE).edit().putBoolean("confirmationInstallUsed", true).apply();
                                    say("✓ Install reference used on your ticket or order. New code is now available.", OK);
                                    render();
                                }));
                            } catch (Exception ignored) { /* install usage check is best-effort */ }
                            finally { ui.post(() -> refreshBusy = false); }
                        });
                    }
                }
            }
            ui.postDelayed(this, 4000);
        }
    };
    private final Runnable expiryTick = new Runnable() {
        public void run() { if (isFinishing() || isDestroyed()) return; if (wizard.step == SetupWizard.Step.DONE && confirmCode.length() > 0 && !busy) render(); ui.postDelayed(this, 1000); }
    };
    private Button turnOn, find, amazonBtn, androidBtn, next, reset, startAgain;
    private TextView status, deviceHelp, heading, description;
    private LinearLayout devicePick;
    private String device;
    private Enabler.Checks checks;
    private boolean busy;
    private String apps;
    private volatile java.util.List<Enabler.AppResult> appsResults = new java.util.ArrayList<>();
    private Button appsNew, appsHave, appsBack;
    private LinearLayout appsList;
    private LinearLayout welcomeBox, contentBox;
    private boolean welcomeDone;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        SharedPreferences prefs = getSharedPreferences("tv", MODE_PRIVATE);
        LinearLayout col = new LinearLayout(this);
        contentBox = col;
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(20), dp(32), dp(20), dp(24));
        contentBox.setBackgroundColor(BG);
        contentBox.addView(text("BM TV Enabler", 26, FG, true));
        contentBox.addView(text("TV setup · 1.43", 14, MUTED, false));
        // Welcome on open: logo, message and Get started before the wizard.
        welcomeBox = new LinearLayout(this);
        welcomeBox.setOrientation(LinearLayout.VERTICAL);
        welcomeBox.setGravity(Gravity.CENTER_HORIZONTAL);
        welcomeBox.setPadding(dp(12), dp(24), dp(12), dp(16));
        welcomeBox.setBackgroundColor(BG);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.bm_logo);
        logo.setContentDescription("BM Support");
        LinearLayout.LayoutParams logoLp = new LinearLayout.LayoutParams(dp(190), dp(190));
        logoLp.gravity = Gravity.CENTER_HORIZONTAL;
        welcomeBox.addView(logo, logoLp);
        TextView welcomeTitle = text("Welcome to BM TV Enabler", 24, FG, true);
        welcomeTitle.setGravity(Gravity.CENTER);
        welcomeBox.addView(welcomeTitle, lp(dp(10)));
        TextView welcomeText = text("This free app from BM Support sets up your TV with our apps or gets it ready for staff screen-share support — just follow the steps. Put this device and your TV on the same Wi-Fi to begin.", 16, MUTED, false);
        welcomeText.setGravity(Gravity.CENTER);
        welcomeBox.addView(welcomeText, lp(dp(4)));
        // PIN login: customers get a 24-hour PIN on their ticket/order at bmsupport.uk.
        final boolean loggedIn = prefs.getLong("pinExpires", 0) > System.currentTimeMillis();
        final EditText pinInput = new EditText(this);
        pinInput.setHint("6-digit PIN from your ticket or order");
        pinInput.setInputType(android.text.InputType.TYPE_CLASS_NUMBER | android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        pinInput.setFilters(new android.text.InputFilter[]{ new android.text.InputFilter.LengthFilter(6) });
        pinInput.setTextColor(FG); pinInput.setHintTextColor(MUTED); pinInput.setGravity(Gravity.CENTER); pinInput.setTextSize(20);
        final TextView pinMsg = text(loggedIn ? "You're logged in." : "Type your BM TV Enabler PIN to continue. Get it from the Remote setup tab on your ticket or order at bmsupport.uk — it lasts 24 hours.", 14, MUTED, false);
        pinMsg.setGravity(Gravity.CENTER);
        if (!loggedIn) { welcomeBox.addView(pinMsg, lp(dp(14))); welcomeBox.addView(pinInput, lp(dp(6))); }
        Button startBtn = button(loggedIn ? "Get started" : "Log in", ACCENT);
        startBtn.setOnClickListener(v -> {
            if (prefs.getLong("pinExpires", 0) > System.currentTimeMillis()) { startFresh(); return; }
            final String pin = pinInput.getText().toString().trim();
            if (!pin.matches("\\d{6}")) { pinMsg.setText("Type the 6-digit PIN."); return; }
            startBtn.setEnabled(false); pinMsg.setText("Checking your PIN…");
            new Thread(() -> {
                String err = null; long exp = 0;
                try {
                    java.net.HttpURLConnection h = (java.net.HttpURLConnection) new java.net.URL("https://bmsupport.uk/api/public/enabler-login").openConnection();
                    h.setRequestMethod("POST"); h.setDoOutput(true); h.setConnectTimeout(15000); h.setReadTimeout(15000);
                    h.setRequestProperty("content-type", "application/json");
                    h.getOutputStream().write(("{\"pin\":\"" + pin + "\",\"app\":\"phone-1.33\"}").getBytes("UTF-8"));
                    int code = h.getResponseCode();
                    java.io.InputStream in = code < 400 ? h.getInputStream() : h.getErrorStream();
                    String body = in == null ? "{}" : new String(readAll(in), "UTF-8");
                    org.json.JSONObject j = new org.json.JSONObject(body);
                    if (code >= 400 || !j.has("token")) err = j.optString("error", "PIN not recognised.");
                    else { exp = j.getLong("expiresAtMs"); prefs.edit().putString("pinToken", j.getString("token")).putLong("pinExpires", exp).apply(); }
                } catch (Exception e) { err = "Couldn't reach bmsupport.uk. Check your internet and try again."; }
                final String fe = err;
                runOnUiThread(() -> {
                    startBtn.setEnabled(true);
                    if (fe != null) { pinMsg.setText(fe); return; }
                    startFresh();
                });
            }).start();
        });
        LinearLayout.LayoutParams startLp = new LinearLayout.LayoutParams(dp(240), LinearLayout.LayoutParams.WRAP_CONTENT);
        startLp.gravity = Gravity.CENTER_HORIZONTAL; startLp.topMargin = dp(12);
        welcomeBox.addView(startBtn, startLp);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        root.addView(welcomeBox);
        root.addView(contentBox);
        heading = text("", 22, FG, true); col.addView(heading, lp(dp(20)));
        description = text("", 16, MUTED, false); col.addView(description, lp(dp(8)));
        devicePick = new LinearLayout(this);
        devicePick.setOrientation(LinearLayout.HORIZONTAL);
        amazonBtn = button("Amazon Fire TV / Stick", Color.parseColor("#2A3050"));
        androidBtn = button("Android / Google TV", Color.parseColor("#2A3050"));
        LinearLayout.LayoutParams halfL = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
        halfL.rightMargin = dp(6);
        LinearLayout.LayoutParams halfR = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
        halfR.leftMargin = dp(6);
        devicePick.addView(amazonBtn, halfL); devicePick.addView(androidBtn, halfR);
        col.addView(devicePick, lp(dp(12)));
        deviceHelp = text("", 15, MUTED, false); col.addView(deviceHelp, lp(dp(8)));
        appsNew = button("Install our apps", Color.parseColor("#2A3050"));
        appsHave = button("Screen-share support", Color.parseColor("#2A3050"));
        appsBack = button("Back", Color.parseColor("#2A3050"));
        appsNew.setOnClickListener(v -> pickApps("new"));
        appsHave.setOnClickListener(v -> pickApps("have"));
        appsBack.setOnClickListener(v -> { if (!busy) { apps = null; getSharedPreferences("tv", MODE_PRIVATE).edit().remove("apps").apply(); render(); } });
        col.addView(appsNew, lp(dp(12))); col.addView(appsHave, lp(dp(8))); col.addView(appsBack, lp(dp(8)));
        amazonBtn.setOnClickListener(v -> pickDevice("amazon"));
        androidBtn.setOnClickListener(v -> pickDevice("android"));
        address = new EditText(this);
        address.setHint("TV address, e.g. 192.168.1.23");
        address.setHintTextColor(MUTED); address.setTextColor(FG); address.setTextSize(20);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        address.setKeyListener(android.text.method.DigitsKeyListener.getInstance("0123456789."));
        address.setText(prefs.getString("host", "")); col.addView(address, lp(dp(12)));
        tvCodeInput = new EditText(this);
        tvCodeInput.setHint("4-digit code on your TV");
        tvCodeInput.setHintTextColor(MUTED); tvCodeInput.setTextColor(FG); tvCodeInput.setTextSize(28);
        tvCodeInput.setInputType(InputType.TYPE_CLASS_NUMBER);
        tvCodeInput.setFilters(new android.text.InputFilter[]{ new android.text.InputFilter.LengthFilter(4) });
        col.addView(tvCodeInput, lp(dp(12)));
        showAgain = button("Show code again on TV", Color.parseColor("#2A3050"));
        showAgain.setOnClickListener(v -> { if (!busy && wizard.tvCode != null) showCode(address.getText().toString().trim(), wizard.tvCode); });
        col.addView(showAgain, lp(dp(8)));
        confirmCode = text("", 40, OK, true);
        confirmCode.setGravity(Gravity.CENTER); confirmCode.setTextIsSelectable(true);
        col.addView(confirmCode, lp(dp(12)));
        installCodeView = text("", 40, OK, true);
        installCodeView.setGravity(Gravity.CENTER); installCodeView.setTextIsSelectable(true);
        col.addView(installCodeView, lp(dp(4)));
        appsList = new LinearLayout(this);
        appsList.setOrientation(LinearLayout.VERTICAL);
        col.addView(appsList, lp(dp(8)));
        find = button("Find my Fire TV", Color.parseColor("#2A3050"));
        find.setOnClickListener(v -> scan()); col.addView(find, lp(dp(8)));
        status = text("", 16, WARN, false); col.addView(status, lp(dp(12)));
        turnOn = button("", ACCENT); turnOn.setOnClickListener(v -> start()); col.addView(turnOn, lp(dp(12)));
        next = button("Done — next step", ACCENT);
        next.setOnClickListener(v -> newInstallCode()); col.addView(next, lp(dp(8)));
        reset = button("Reset setup", Color.parseColor("#2A3050"));
        reset.setOnClickListener(v -> confirmReset()); col.addView(reset, lp(dp(20)));
        startAgain = button("Return to the start", ACCENT);
        startAgain.setOnClickListener(v -> backToStart()); col.addView(startAgain, lp(dp(20)));
        ScrollView sv = new ScrollView(this); sv.setBackgroundColor(BG); sv.setFillViewport(true); sv.addView(root); setContentView(sv);
        // A remembered platform/address is a convenience, never proof that a TV is ready.
        device = prefs.getString("device", null);
        if (!"amazon".equals(device) && !"android".equals(device)) device = null;
        apps = prefs.getString("apps", null);
        if (!"new".equals(apps) && !"have".equals(apps)) apps = null;
        restoreConfirmation();
        readLink(getIntent());
        render();
        ui.postDelayed(expiryTick, 1000);
        ui.postDelayed(refreshTick, 4000);
    }

    @Override protected void onNewIntent(android.content.Intent intent) { super.onNewIntent(intent); setIntent(intent); readLink(intent); render(); }

    /** A scanned website QR (bmtvenabler://link?code=12345678) links this app to the ticket/order. */
    private void readLink(android.content.Intent intent) {
        android.net.Uri u = intent == null ? null : intent.getData();
        String c = u == null ? null : u.getQueryParameter("code");
        if (c == null || !c.matches("\\d{8}")) return;
        getSharedPreferences("tv", MODE_PRIVATE).edit().putString("link", c).putLong("link_at", System.currentTimeMillis()).apply();
        say("✓ Linked to your ticket or order. Your TV checks and TV code will be sent there automatically.", OK);
    }

    private String linkCode() {
        SharedPreferences p = getSharedPreferences("tv", MODE_PRIVATE);
        String c = p.getString("link", null);
        if (c == null || System.currentTimeMillis() - p.getLong("link_at", 0) > 2 * 3600_000L) return null;
        return c;
    }

    /** Restore the original reference and its usage without restarting TV setup. */
    private boolean restoreConfirmation() {
        SharedPreferences prefs = getSharedPreferences("tv", MODE_PRIVATE);
        String savedCode = prefs.getString("confirmation", null);
        long savedExpiry = prefs.getLong("confirmationExpiry", 0);
        String savedHost = prefs.getString("confirmationHost", null);
        String savedDevice = prefs.getString("device", null);
        if (savedHost == null || !SetupWizard.validHost(savedHost) || savedDevice == null
                || !wizard.resumeConfirmation(savedCode, savedExpiry, System.currentTimeMillis())) return false;
        device = savedDevice; confirmExpiresAt = savedExpiry;
        confirmationUsed = prefs.getBoolean("confirmationUsed", false);
        refreshHost = savedHost; refreshToken = prefs.getString("confirmationToken", "");
        address.setText(savedHost); apps = "have";
        checks = new Enabler.Checks(); checks.adb = checks.helper = checks.control = checks.accessibility = true; checks.type = device;
        confirmCode.setText(savedCode.substring(0, 3) + "-" + savedCode.substring(3));
        return true;
    }

    private boolean confirmationValid() { return confirmCode.length() > 0 && System.currentTimeMillis() < confirmExpiresAt; }

    /** Restore the install reference the same way: it lasts 24 hours from creation. */
    private boolean restoreInstallConfirmation() {
        SharedPreferences prefs = getSharedPreferences("tv", MODE_PRIVATE);
        String code = prefs.getString("confirmationInstall", null);
        long expiry = prefs.getLong("confirmationInstallExpiry", 0);
        String host = prefs.getString("confirmationInstallHost", null);
        if (code == null || host == null || !SetupWizard.validHost(host) || device == null
                || !wizard.resumeConfirmation(code, expiry, System.currentTimeMillis())) return false;
        installCodeText = code; installExpiresAt = expiry;
        installUsed = prefs.getBoolean("confirmationInstallUsed", false);
        installRefreshToken = prefs.getString("confirmationInstallToken", "");
        address.setText(host); apps = "new";
        appsResults = new java.util.ArrayList<>();
        return true;
    }

    private void pickApps(String a) {
        if (busy || refreshBusy) return;
        if ("have".equals(a) && restoreConfirmation()) { getSharedPreferences("tv", MODE_PRIVATE).edit().putString("apps", a).apply(); say("", MUTED); render(); return; }
        // A remembered install reference skips re-installing: the apps are already on the TV.
        if ("new".equals(a) && restoreInstallConfirmation()) { getSharedPreferences("tv", MODE_PRIVATE).edit().putString("apps", a).apply(); say("", MUTED); render(); return; }
        apps = a;
        getSharedPreferences("tv", MODE_PRIVATE).edit().putString("apps", a).apply();
        // Debugging was already confirmed on this TV: go straight to Connect with the saved address.
        if (device != null && SetupWizard.validHost(address.getText().toString().trim())) wizard.confirmDebugging();
        render();
    }

    private void pickDevice(String d) {
        if (busy || refreshBusy) return;
        device = d;
        getSharedPreferences("tv", MODE_PRIVATE).edit().putString("device", d).apply();
        render();
    }

    private void render() {
        welcomeBox.setVisibility(welcomeDone ? View.GONE : View.VISIBLE);
        contentBox.setVisibility(welcomeDone ? View.VISIBLE : View.GONE);
        SetupWizard.Step s = wizard.step;
        boolean askApps = s == SetupWizard.Step.DEBUGGING && apps == null;
        boolean install = "new".equals(apps);
        boolean installDone = SetupWizard.installFinished(s, apps);
        boolean supportDone = s == SetupWizard.Step.DONE && !install;
        reset.setVisibility(installDone ? View.GONE : View.VISIBLE);
        startAgain.setVisibility(installDone || supportDone ? View.VISIBLE : View.GONE);
        appsNew.setVisibility(askApps ? View.VISIBLE : View.GONE); appsHave.setVisibility(askApps ? View.VISIBLE : View.GONE);
        appsBack.setVisibility(s == SetupWizard.Step.DEBUGGING && apps != null ? View.VISIBLE : View.GONE);
        boolean pick = (s == SetupWizard.Step.DEBUGGING && !askApps) || (!install && s == SetupWizard.Step.DONE && device == null && confirmCode.length() == 0);
        devicePick.setVisibility(pick ? View.VISIBLE : View.GONE);
        deviceHelp.setVisibility(pick ? View.VISIBLE : View.GONE);
        address.setVisibility(s == SetupWizard.Step.CHECK ? View.VISIBLE : View.GONE);
        find.setVisibility(s == SetupWizard.Step.CHECK ? View.VISIBLE : View.GONE);
        tvCodeInput.setVisibility(s == SetupWizard.Step.TV_CODE ? View.VISIBLE : View.GONE);
        showAgain.setVisibility(s == SetupWizard.Step.TV_CODE ? View.VISIBLE : View.GONE);
        confirmCode.setVisibility(s == SetupWizard.Step.DONE && !install && confirmCode.length() > 0 ? View.VISIBLE : View.GONE);
        installCodeView.setVisibility(installDone && installCodeText.length() > 0 ? View.VISIBLE : View.GONE);
        if (installCodeView.getVisibility() == View.VISIBLE) installCodeView.setText(System.currentTimeMillis() >= installExpiresAt ? "Expired" : installCodeText.substring(0, 3) + "-" + installCodeText.substring(3));
        boolean installDoneCode = installDone && installCodeText.length() > 0;
        next.setVisibility(installDoneCode ? View.VISIBLE : View.GONE);
        if (installDoneCode) {
            boolean canNew = SetupWizard.canIssueConfirmation(true, installExpiresAt, installUsed, System.currentTimeMillis()) && !busy;
            next.setText(installUsed || System.currentTimeMillis() >= installExpiresAt ? "New code" : "New code — available after use or expiry");
            next.setEnabled(canNew); next.setAlpha(canNew ? 1f : 0.4f);
        }
        turnOn.setVisibility((s == SetupWizard.Step.DEBUGGING && (device == null || apps == null)) || (s == SetupWizard.Step.DONE && install) ? View.GONE : View.VISIBLE);
        find.setText("android".equals(device) ? "Find my Android TV" : "Find my Fire TV");
        appsList.setVisibility(installDone && !appsResults.isEmpty() ? View.VISIBLE : View.GONE);
        if (appsList.getVisibility() == View.VISIBLE) {
            appsList.removeAllViews();
            for (Enabler.AppResult r : appsResults) {
                LinearLayout row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                TextView name = text(r.name, 16, FG, true);
                LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
                row.addView(name, np);
                TextView state = text(r.status == Enabler.AppResult.INSTALLED ? "Installed"
                        : r.status == Enabler.AppResult.ALREADY ? "Already on your TV"
                        : "Didn't install — press Return to the start to try again", 14,
                        r.status == Enabler.AppResult.FAILED ? WARN : OK, false);
                state.setGravity(Gravity.END);
                row.addView(state);
                appsList.addView(row);
            }
        }
        amazonBtn.setBackgroundColor("amazon".equals(device) ? ACCENT : Color.parseColor("#2A3050"));
        androidBtn.setBackgroundColor("android".equals(device) ? ACCENT : Color.parseColor("#2A3050"));
        switch (s) {
            case DEBUGGING:
                if (askApps) {
                    heading.setText("What do you need?");
                    description.setText("Install our apps: puts all our apps on your TV for you.\n\nScreen-share support: lets our staff see your TV and help you through your ticket or order.");
                    break;
                }
                heading.setText(device == null ? "Which TV are you setting up?" : "1. Enable TV debugging");
                deviceHelp.setText(device == null ? "Choose your TV to see the right steps." : "Wrong TV? Choose the other one.");
                if (device == null) description.setText("");
                else if ("amazon".equals(device)) description.setText("Put this phone and your Fire TV on the same Wi-Fi.\n\nOn the Fire TV: Settings › My Fire TV › About — press the device name 7 times. Go back to My Fire TV › Developer options and switch ADB debugging ON.");
                else description.setText("Put this phone and your TV on the same Wi-Fi.\n\nOn the TV: Settings › System › About — press Android TV OS build 7 times. Go back to System › Developer options and switch Network debugging ON, or Wireless debugging ON if your TV has that instead.");
                turnOn.setText("I've switched debugging on — next"); break;
            case CHECK:
                heading.setText("2. Connect to your TV");
                description.setText(("android".equals(device) ? "Press Find my Android TV and pick yours (Amazon devices are left out), or type the address from the TV's network settings." : "Press Find my Fire TV and pick yours — only Amazon Fire TVs are listed — or type the address from the TV's network settings.") + "\n\nWhen the TV asks, tick Always allow and press Allow. Setup then runs by itself.");
                turnOn.setText("Connect to this TV"); break;
            case TV_CODE:
                heading.setText("3. Type the code on your TV");
                description.setText("Look at your TV — the 4-digit code is now on screen (on Android / Google TV it shows as the TV's device name on the About page). Type it below so we know this is your TV. After that, setup runs by itself.");
                turnOn.setText("Confirm code and set up my TV"); break;
            case SETUP:
                heading.setText(install ? "4. Installing our apps" : "4. Setting up your TV");
                if (install) { description.setText("We're putting our apps on your TV one by one. Keep both devices awake."); turnOn.setText("Try again"); break; }
                description.setText("We check what's already on the TV, install BM Remote Helper and remote control if needed, switch remote control on, then check everything again. Keep both devices awake.");
                turnOn.setText("Try again"); break;
            case DONE:
                if (install) {
                    heading.setText("Your apps are installed");
                    long iMinutes = Math.max(0, (installExpiresAt - System.currentTimeMillis() + 59999) / 60000);
                    description.setText(installCodeText.length() > 0 && System.currentTimeMillis() < installExpiresAt
                            ? "Each app is listed below with what happened.\n\nType the code shown into the Remote setup tab on your ticket or order at bmsupport.uk to confirm the apps are installed. It lasts 24 hours — expires in " + (iMinutes / 60) + "h " + (iMinutes % 60) + "m."
                            : installCodeText.length() > 0
                            ? "Each app is listed below with what happened. Your install code has expired — press New code for a fresh one."
                            : "Each app is listed below with what happened. You can close this app, or press Return to the start to do something else.");
                    break;
                }
                heading.setText("TV setup confirmed");
                deviceHelp.setText("Which TV is this? Choose the same type as your ticket or order.");
                boolean expired = confirmCode.length() > 0 && System.currentTimeMillis() >= confirmExpiresAt;
                heading.setText(expired ? "Confirmation code expired" : "TV setup confirmed");
                confirmCode.setVisibility(expired ? View.GONE : confirmCode.getVisibility());
                long minutes = Math.max(0, (confirmExpiresAt - System.currentTimeMillis() + 59999) / 60000);
                description.setText(expired ? "Expired — press New code to get a fresh confirmation code."
                        : confirmCode.length() > 0
                        ? "Type this code into the Remote setup tab on your ticket or order at bmsupport.uk. You can reuse it on the same ticket or order for 24 hours.\n\nExpires in " + (minutes / 60) + "h " + (minutes % 60) + "m.\n\nThen press Connect on that tab to request screen sharing."
                        : "Your TV is ready. Get your confirmation code, then type it on your ticket or order's Remote setup tab.");
                if (linkCode() != null) { description.setText("Your TV is ready and this app is linked to your ticket or order. Press the button to send everything to the website, then press Connect there."); turnOn.setText("Send to the website"); }
                else turnOn.setText(confirmCode.length() > 0 ? (expired || confirmationUsed ? "New code" : "New code — available after use or expiry") : "Get my confirmation code");
                if (!expired && confirmationUsed) description.setText(description.getText() + "\n\nThis reference has been used on a ticket or order. New code is now available for another ticket or order; the existing reference stays valid on its original page until expiry.");
                if (!expired && confirmCode.length() > 0) description.setText(description.getText() + "\n\nNeed apps installed too? Press Return to the start — this code is kept until it expires.");
                break;
        }
        setBusy(busy);
        if (supportDone && !SetupWizard.canIssueConfirmation(confirmCode.length() > 0, confirmExpiresAt, confirmationUsed, System.currentTimeMillis()) && linkCode() == null) { turnOn.setEnabled(false); turnOn.setAlpha(0.4f); }
    }

    private void start() {
        if (busy || refreshBusy) return;
        if (wizard.step == SetupWizard.Step.DEBUGGING) { wizard.confirmDebugging(); say("", MUTED); render(); return; }
        final String host = address.getText().toString().trim();
        if (!SetupWizard.validHost(host)) { say("Type the TV's address exactly as it shows on the TV, e.g. 192.168.1.23.", WARN); return; }
        final SetupWizard.Step stage = wizard.step;
        if (stage == SetupWizard.Step.DONE && linkCode() == null && !SetupWizard.canIssueConfirmation(confirmCode.length() > 0, confirmExpiresAt, confirmationUsed, System.currentTimeMillis())) return;
        if (stage == SetupWizard.Step.CHECK) { showCode(host, null); return; }
        if (stage == SetupWizard.Step.TV_CODE) {
            SetupWizard.CodeResult r = wizard.enterCode(tvCodeInput.getText().toString());
            if (r == SetupWizard.CodeResult.WRONG) { say("That's not the code on this TV. Check the TV screen and try again.", WARN); return; }
            if (r == SetupWizard.CodeResult.RESET) { tvCodeInput.setText(""); say("That code didn't match 3 times, so we've disconnected. Check you've picked the right TV and connect again.", ACCENT); render(); return; }
            tvCodeInput.setText(""); render();
        }
        final String selectedDevice = device;
        if (wizard.step == SetupWizard.Step.DONE && device == null) { say("Choose which TV this is first.", WARN); return; }
        final SetupWizard.Step run = wizard.step;
        setBusy(true); say(run == SetupWizard.Step.DONE ? "Getting your confirmation code…" : "Checking your TV…", MUTED);
        io.execute(() -> {
            try {
                Enabler.Progress progress = (i, msg) -> ui.post(() -> { if (!isFinishing() && !isDestroyed()) say(msg, i == 1 ? WARN : MUTED); });
                final String link = linkCode();
                String sentTo = null;
                if (run == SetupWizard.Step.DONE && link != null) {
                    try { Enabler.reportLinked(link, checks, selectedDevice, Enabler.readHelperCode(this, host)); sentTo = link; }
                    catch (Enabler.LinkExpired e) { getSharedPreferences("tv", MODE_PRIVATE).edit().remove("link").apply(); throw e; }
                }
                final boolean linkedSent = sentTo != null;
                final Enabler.Confirmation issued = run == SetupWizard.Step.DONE && !linkedSent ? Enabler.requestConfirmCode(checks, selectedDevice, Enabler.readHelperCode(this, host)) : null;
                final boolean installOnly = "new".equals(apps);
                final Enabler.Confirmation[] installIssued = new Enabler.Confirmation[1];
                if (run == SetupWizard.Step.SETUP && installOnly) {
                    appsResults = Enabler.installOurApps(this, host, progress);
                    boolean anyFailed = false;
                    for (Enabler.AppResult r : appsResults) if (r.status == Enabler.AppResult.FAILED) { anyFailed = true; break; }
                    if (!anyFailed) {
                        try {
                            progress.step(0, "Confirming the installation…");
                            Enabler.Checks verify = Enabler.checkExisting(this, host, (i, t) -> {});
                            Enabler.Checks proof = new Enabler.Checks();
                            proof.adb = true; proof.helper = verify.helper; proof.control = verify.control; proof.accessibility = false;
                            installIssued[0] = Enabler.requestConfirmCode(proof, verify.type != null ? verify.type : selectedDevice, null, "install");
                        } catch (Exception ignored) { /* The apps are on the TV either way; the code is extra proof for the ticket or order. */ }
                    }
                }
                else if (run == SetupWizard.Step.SETUP) {
                    checks = Enabler.checkExisting(this, host, progress);
                    if (!SetupWizard.ready(checks.adb, checks.helper, checks.control, checks.accessibility)) {
                        Enabler.enableUntil(this, host, 4, progress);
                        progress.step(0, "Checking everything on the TV one last time…");
                        checks = Enabler.checkExisting(this, host, progress);
                    }
                }
                ui.post(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    setBusy(false);
                    if (run == SetupWizard.Step.SETUP && installOnly) {
                        wizard.setupFinished(true);
                        if (installIssued[0] != null) {
                            installCodeText = installIssued[0].code; installExpiresAt = installIssued[0].expiresAt;
                            installRefreshToken = installIssued[0].refreshToken; installUsed = false;
                            getSharedPreferences("tv", MODE_PRIVATE).edit().putString("confirmationInstall", installIssued[0].code)
                                .putLong("confirmationInstallExpiry", installIssued[0].expiresAt).putString("confirmationInstallToken", installIssued[0].refreshToken)
                                .putBoolean("confirmationInstallUsed", false).putString("confirmationInstallHost", host).commit();
                        }
                        long failedCount = 0;
                        for (Enabler.AppResult r : appsResults) if (r.status == Enabler.AppResult.FAILED) failedCount++;
                        if (failedCount == 0) say("✓ All done — " + appsResults.size() + " app" + (appsResults.size() == 1 ? "" : "s") + " on your TV. See the list below.", OK);
                        else say("Done, but " + failedCount + " app" + (failedCount == 1 ? "" : "s") + " didn't install — see the list below. Press Return to the start to try again.", WARN);
                    } else if (run == SetupWizard.Step.SETUP) {
                        boolean ready = SetupWizard.ready(checks.adb, checks.helper, checks.control, checks.accessibility);
                        wizard.setupFinished(ready);
                        // The TV tells us its own make, so customers never pick Amazon or Android.
                        if (checks.type != null) { device = checks.type; getSharedPreferences("tv", MODE_PRIVATE).edit().putString("device", device).apply(); }
                        // Linked by the website QR: send straight there, no button or code needed.
                        if (ready && linkCode() != null && device != null) ui.post(this::start);
                        say(ready ? "✓ TV setup confirmed: both apps installed and remote control switched on." : "The TV is not fully ready yet. Press Try again.", ready ? OK : WARN);
                    } else {
                        if (linkedSent) say("✓ Sent to your ticket or order. On the website, press Connect.", OK);
                        else if (issued != null) {
                            refreshToken = issued.refreshToken; refreshHost = host; confirmExpiresAt = issued.expiresAt;
                            confirmationUsed = false;
                            getSharedPreferences("tv", MODE_PRIVATE).edit().putString("confirmation", issued.code)
                                .putBoolean("confirmationUsed", false)
                                .putLong("confirmationExpiry", issued.expiresAt).putString("confirmationToken", issued.refreshToken)
                                .putString("confirmationHost", host).putString("device", selectedDevice).commit();
                            confirmCode.setText(issued.code.substring(0, 3) + "-" + issued.code.substring(3)); say("✓ Code ready. Type it on your ticket or order's Remote setup tab.", OK);
                        }
                    }
                    render();
                });
            } catch (Exception e) {
                String message = Enabler.friendly(e);
                ui.post(() -> { if (!isFinishing() && !isDestroyed()) { setBusy(false); say(message, ACCENT); render(); turnOn.setText("Try again"); } });
            }
        });
    }

    /** Connects and puts a fresh 4-digit code on the TV, or re-shows the current one. */
    private void showCode(String host, String existing) {
        final String code = existing != null ? existing : SetupWizard.newCode(random);
        getSharedPreferences("tv", MODE_PRIVATE).edit().putString("host", host).apply();
        setBusy(true); say("Connecting… keep this app open and watch your TV for an Allow box.", MUTED);
        io.execute(() -> {
            try {
                Enabler.showTvCode(this, host, code, (i, msg) -> ui.post(() -> { if (!isFinishing() && !isDestroyed()) say(msg, i == 1 ? WARN : MUTED); }));
                ui.post(() -> { if (isFinishing() || isDestroyed()) return; setBusy(false);
                    wizard.paired(); say("✓ Connected to your TV. Setting it up now…", OK); render(); turnOn.performClick(); });
            } catch (Exception e) {
                String message = Enabler.friendly(e);
                ui.post(() -> { if (!isFinishing() && !isDestroyed()) { setBusy(false); say(message, ACCENT); render(); turnOn.setText(existing == null ? "Try again" : turnOn.getText()); } });
            }
        });
    }


    /** After the welcome/PIN, always begin at "What do you need?" unless a setup is mid-way. */
    private void startFresh() {
        welcomeDone = true;
        boolean validConfirmation = wizard.step == SetupWizard.Step.DONE && confirmCode.length() > 0 && System.currentTimeMillis() < confirmExpiresAt;
        if (!validConfirmation && (wizard.step == SetupWizard.Step.DEBUGGING || wizard.step == SetupWizard.Step.DONE)) {
            if (wizard.step == SetupWizard.Step.DONE) { wizard.reset(); checks = null; confirmCode.setText(""); refreshToken = null; refreshHost = null; appsResults = new java.util.ArrayList<>(); }
            apps = null; getSharedPreferences("tv", MODE_PRIVATE).edit().remove("apps").apply();
        }
        render();
    }

    /** A finished app-install run goes back to "What do you need?" — the saved TV address,
     *  device choice and TV authorization are kept, so nothing restarts from scratch. */
    private void backToStart() {
        if (busy || refreshBusy) return;
        // Saved screen-share reference (code, expiry, refresh token, TV) is kept until it expires.
        wizard.reset(); apps = null; appsResults = new java.util.ArrayList<>();
        if (!confirmationValid()) checks = null;
        getSharedPreferences("tv", MODE_PRIVATE).edit().remove("apps").apply();
        say("", MUTED); render();
    }

    /** A fresh install reference after the last one was used on a ticket/order or expired. */
    private void newInstallCode() {
        if (busy || refreshBusy || !SetupWizard.installFinished(wizard.step, apps)) return;
        if (!SetupWizard.canIssueConfirmation(installCodeText.length() > 0, installExpiresAt, installUsed, System.currentTimeMillis())) return;
        final String host = address.getText().toString().trim();
        if (!SetupWizard.validHost(host)) { say("Type the TV's address first.", WARN); return; }
        setBusy(true); say("Checking your TV…", MUTED);
        io.execute(() -> {
            try {
                Enabler.Checks verify = Enabler.checkExisting(this, host, (i, t) -> {});
                Enabler.Checks proof = new Enabler.Checks();
                proof.adb = true; proof.helper = verify.helper; proof.control = verify.control; proof.accessibility = false;
                final Enabler.Confirmation issued = Enabler.requestConfirmCode(proof, verify.type != null ? verify.type : device, null, "install");
                getSharedPreferences("tv", MODE_PRIVATE).edit().putString("confirmationInstall", issued.code)
                    .putLong("confirmationInstallExpiry", issued.expiresAt).putString("confirmationInstallToken", issued.refreshToken)
                    .putBoolean("confirmationInstallUsed", false).putString("confirmationInstallHost", host).commit();
                ui.post(() -> { if (isFinishing() || isDestroyed()) return; installCodeText = issued.code; installExpiresAt = issued.expiresAt; installRefreshToken = issued.refreshToken; installUsed = false; setBusy(false); say("✓ New install code ready. Type it on your ticket or order's Remote setup tab.", OK); render(); });
            } catch (Exception e) { ui.post(() -> { if (!isFinishing() && !isDestroyed()) { setBusy(false); say(Enabler.friendly(e), WARN); render(); } }); }
        });
    }

    private void confirmReset() {
        if (busy || refreshBusy) return;
        new AlertDialog.Builder(this).setTitle("Reset setup?")
                .setMessage("Start again from debugging instructions and clear the saved TV address, device choice and confirmation code? Installed TV apps and this phone's TV authorization are kept.")
                .setNegativeButton("Cancel", null).setPositiveButton("Reset setup", (d, which) -> {
                    wizard.reset(); checks = null; device = null; apps = null; appsResults = new java.util.ArrayList<>();
                    installCodeText = ""; installExpiresAt = 0; installRefreshToken = null; installUsed = false;
                    getSharedPreferences("tv", MODE_PRIVATE).edit().remove("host").remove("device").remove("apps")
                        .remove("confirmation").remove("confirmationExpiry").remove("confirmationToken").remove("confirmationHost")
                        .remove("confirmationInstall").remove("confirmationInstallExpiry").remove("confirmationInstallToken").remove("confirmationInstallHost").remove("confirmationInstallUsed").commit();
                    address.setText(""); confirmCode.setText(""); refreshToken = null; refreshHost = null; say("", MUTED); render();
                }).show();
    }

    /** Lists advertised Fire TVs, including those whose debugging port is closed. */
    private void scan() {
        if (busy || refreshBusy) return;
        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
        int ip = wm == null ? 0 : wm.getConnectionInfo().getIpAddress();
        if (ip == 0) { say("Connect this phone to your home Wi-Fi first.", WARN); return; }
        String base = (ip & 0xff) + "." + ((ip >> 8) & 0xff) + "." + ((ip >> 16) & 0xff) + ".";
        setBusy(true);
        say("Looking for your TV on the Wi-Fi…", MUTED);
        io.execute(() -> {
            WifiManager.MulticastLock lock = wm.createMulticastLock("bm-fire-tv-discovery");
            lock.setReferenceCounted(false);
            try {
                lock.acquire();
                final boolean wantAndroid = "android".equals(device);
                // No type filter: list every device on the Wi-Fi with its name, Amazon first.
                List<DiscoveredDevice> found = DeviceDiscovery.scanAll(base);
                ui.post(() -> {
                    setBusy(false);
                    if (isFinishing() || isDestroyed()) return;
                    if (found.isEmpty()) {
                        say("Nothing answered on this Wi-Fi. Keep the TV awake on the same Wi-Fi, or type the TV's address.", WARN);
                    } else showDevices(found, false);
                    if (false) {
                        say((wantAndroid ? "No Android TV found." : "No Fire TV found.") + " Keep the TV awake on the same Wi-Fi, try Show all devices, or type the TV's address.", WARN);
                        new AlertDialog.Builder(this).setTitle(wantAndroid ? "No Android TV found" : "No Fire TV found")
                                .setMessage("Some TVs don't announce themselves. Show everything on this Wi-Fi? Only devices that can be set up can be picked.")
                                .setNegativeButton("Cancel", null).setPositiveButton("Show all devices", (d, w) -> scanAll()).show();
                    }
                });
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                ui.post(() -> { setBusy(false); say("Search stopped. Try again or type the TV address.", WARN); });
            } catch (Exception e) {
                ui.post(() -> { setBusy(false); say("Couldn't search this Wi-Fi. Try again or type the TV address.", WARN); });
            } finally { if (lock.isHeld()) lock.release(); }
        });
    }

    private void scanAll() {
        if (busy || refreshBusy) return;
        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
        int ip = wm == null ? 0 : wm.getConnectionInfo().getIpAddress();
        if (ip == 0) { say("Connect this phone to your home Wi-Fi first.", WARN); return; }
        String base = (ip & 0xff) + "." + ((ip >> 8) & 0xff) + "." + ((ip >> 16) & 0xff) + ".";
        setBusy(true);
        say("Looking for every device on the Wi-Fi…", MUTED);
        io.execute(() -> {
            WifiManager.MulticastLock lock = wm.createMulticastLock("bm-all-discovery");
            lock.setReferenceCounted(false);
            try {
                lock.acquire();
                List<DiscoveredDevice> found = DeviceDiscovery.scanAll(base);
                ui.post(() -> {
                    setBusy(false);
                    if (isFinishing() || isDestroyed()) return;
                    if (found.isEmpty()) say("Nothing answered on this Wi-Fi. Check the phone and TV are on the same Wi-Fi, or type the TV's address.", WARN);
                    else showDevices(found, true);
                });
            } catch (Exception e) {
                ui.post(() -> { setBusy(false); say("Couldn't search this Wi-Fi. Try again or type the TV address.", WARN); });
            } finally { if (lock.isHeld()) lock.release(); }
        });
    }

    private void showDevices(List<DiscoveredDevice> devices, boolean all) {
        CharSequence[] labels = new CharSequence[devices.size()];
        for (int i = 0; i < devices.size(); i++) {
            DiscoveredDevice dv = devices.get(i);
            if (all && !dv.debuggingReachable) {
                android.text.SpannableString g = new android.text.SpannableString(dv.name + "\n" + dv.address + "\nCan't be set up — debugging is off or it isn't a TV");
                g.setSpan(new android.text.style.ForegroundColorSpan(Color.parseColor("#6B7280")), 0, g.length(), 0);
                labels[i] = g;
            } else labels[i] = dv.label();
        }
        final int[] selected = {-1};
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Choose your TV")
                .setSingleChoiceItems(labels, -1, (d, index) -> {
                    boolean ok = !all || devices.get(index).debuggingReachable;
                    selected[0] = ok ? index : -1;
                    ((AlertDialog) d).getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(ok);
                })
                .setNegativeButton("Cancel", (d, which) -> say("No TV selected. You can search again or type its address.", MUTED))
            .setPositiveButton("Use this TV", (d, which) -> {
                    DiscoveredDevice dev = DiscoveredDevice.selected(devices, selected[0]);
                    address.setText(dev.address);
                    if (dev.debuggingReachable) {
                        say("Selected " + dev.name + " (" + dev.address + "). Now press Turn on remote control.", OK);
                    } else {
                        String how = "android".equals(device)
                            ? "Settings › System › Developer options › Network debugging (or Wireless debugging)"
                            : "Settings › My Fire TV › Developer options › ADB debugging";
                        say("Selected " + dev.name + " (" + dev.address + "). Debugging isn't reachable — on the TV open " + how + " and switch it on, then try again. Wi-Fi isolation can also block it. This app can't switch it on remotely.", WARN);
                    }
                }).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false));
        dialog.show();
    }

    private void setBusy(boolean b) {
        busy = b;
        for (Button button : new Button[]{turnOn, find, amazonBtn, androidBtn, next, reset, startAgain, showAgain, appsNew, appsHave, appsBack}) {
            button.setEnabled(!b); button.setAlpha(b ? .5f : 1f);
        }
        address.setEnabled(!b); tvCodeInput.setEnabled(!b);
    }
    private void say(String s, int color) { status.setText(s); status.setTextColor(color); }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, dp(6), 0, dp(6)); return t;
    }
    private Button button(String s, int color) {
        Button btn = new Button(this); btn.setText(s); btn.setAllCaps(false); btn.setTextSize(17); btn.setTextColor(FG);
        btn.setBackgroundColor(color); btn.setGravity(Gravity.CENTER); btn.setMinHeight(dp(52)); return btn;
    }
    private LinearLayout.LayoutParams lp(int top) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        p.topMargin = top; return p;
    }
    @Override protected void onDestroy() { ui.removeCallbacks(expiryTick); ui.removeCallbacks(refreshTick); super.onDestroy(); }
    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
    private static byte[] readAll(java.io.InputStream in) throws java.io.IOException {
        java.io.ByteArrayOutputStream o = new java.io.ByteArrayOutputStream(); byte[] b = new byte[4096]; int n;
        while ((n = in.read(b)) > 0) o.write(b, 0, n); return o.toByteArray();
    }
}
