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
    private Button turnOn, find, amazonBtn, androidBtn, next, reset, back, openSupport;
    private TextView status, deviceHelp, heading, description;
    private LinearLayout devicePick;
    private String device;
    private Enabler.Checks checks;
    private boolean busy;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        SharedPreferences prefs = getSharedPreferences("tv", MODE_PRIVATE);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(20), dp(32), dp(20), dp(24));
        col.setBackgroundColor(BG);
        col.addView(text("BM TV Enabler", 26, FG, true));
        col.addView(text("TV setup · 1.18", 14, MUTED, false));
        heading = text("", 22, FG, true); col.addView(heading, lp(dp(20)));
        description = text("", 16, MUTED, false); col.addView(description, lp(dp(8)));
        devicePick = new LinearLayout(this);
        devicePick.setOrientation(LinearLayout.HORIZONTAL);
        amazonBtn = button("Amazon Fire TV", Color.parseColor("#2A3050"));
        androidBtn = button("Android / Google TV", Color.parseColor("#2A3050"));
        LinearLayout.LayoutParams halfL = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
        halfL.rightMargin = dp(6);
        LinearLayout.LayoutParams halfR = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
        halfR.leftMargin = dp(6);
        devicePick.addView(amazonBtn, halfL); devicePick.addView(androidBtn, halfR);
        col.addView(devicePick, lp(dp(12)));
        deviceHelp = text("", 15, MUTED, false); col.addView(deviceHelp, lp(dp(8)));
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
        openSupport = button("Open BM Remote Helper on TV to show my code", Color.parseColor("#2A3050"));
        openSupport.setOnClickListener(v -> openBmSupport()); col.addView(openSupport, lp(dp(8)));
        find = button("Find my Fire TV", Color.parseColor("#2A3050"));
        find.setOnClickListener(v -> scan()); col.addView(find, lp(dp(8)));
        status = text("", 16, WARN, false); col.addView(status, lp(dp(12)));
        turnOn = button("", ACCENT); turnOn.setOnClickListener(v -> start()); col.addView(turnOn, lp(dp(12)));
        next = button("Done — next step", ACCENT);
        next.setOnClickListener(v -> { say("", MUTED); render(); }); col.addView(next, lp(dp(8)));
        back = button("Back to debugging instructions", Color.parseColor("#2A3050"));
        back.setOnClickListener(v -> { if (!busy) { wizard.reset(); checks = null; tvCodeInput.setText(""); confirmCode.setText(""); say("", MUTED); render(); } });
        col.addView(back, lp(dp(8)));
        reset = button("Reset setup", Color.parseColor("#2A3050"));
        reset.setOnClickListener(v -> confirmReset()); col.addView(reset, lp(dp(20)));
        ScrollView sv = new ScrollView(this); sv.setBackgroundColor(BG); sv.setFillViewport(true); sv.addView(col); setContentView(sv);
        // A remembered platform/address is a convenience, never proof that a TV is ready.
        device = prefs.getString("device", null);
        if (!"amazon".equals(device) && !"android".equals(device)) device = null;
        readLink(getIntent());
        render();
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

    private void pickDevice(String d) {
        if (busy) return;
        device = d;
        getSharedPreferences("tv", MODE_PRIVATE).edit().putString("device", d).apply();
        render();
    }

    private void render() {
        SetupWizard.Step s = wizard.step;
        boolean pick = s == SetupWizard.Step.DONE && device == null && confirmCode.length() == 0;
        devicePick.setVisibility(pick ? View.VISIBLE : View.GONE);
        deviceHelp.setVisibility(pick ? View.VISIBLE : View.GONE);
        address.setVisibility(s == SetupWizard.Step.CHECK ? View.VISIBLE : View.GONE);
        find.setVisibility(s == SetupWizard.Step.CHECK ? View.VISIBLE : View.GONE);
        tvCodeInput.setVisibility(s == SetupWizard.Step.TV_CODE ? View.VISIBLE : View.GONE);
        showAgain.setVisibility(s == SetupWizard.Step.TV_CODE ? View.VISIBLE : View.GONE);
        confirmCode.setVisibility(s == SetupWizard.Step.DONE && confirmCode.length() > 0 ? View.VISIBLE : View.GONE);
        openSupport.setVisibility(s == SetupWizard.Step.DONE && wizard.ready ? View.VISIBLE : View.GONE);
        next.setVisibility(View.GONE);
        turnOn.setVisibility(View.VISIBLE);
        back.setVisibility(s == SetupWizard.Step.CHECK || s == SetupWizard.Step.TV_CODE ? View.VISIBLE : View.GONE);
        amazonBtn.setBackgroundColor("amazon".equals(device) ? ACCENT : Color.parseColor("#2A3050"));
        androidBtn.setBackgroundColor("android".equals(device) ? ACCENT : Color.parseColor("#2A3050"));
        switch (s) {
            case DEBUGGING:
                heading.setText("1. Enable TV debugging");
                description.setText("Put this phone and your TV on the same Wi-Fi. Switch on the setting for your TV:\n\nAmazon Fire TV\nSettings › My Fire TV › About — press the device name 7 times. Go back to Developer options and switch ADB debugging ON.\n\nAndroid / Google TV\nSettings › System › About — press Android TV OS build 7 times. Go back to Developer options and switch Network debugging ON, or Wireless debugging ON if your TV has that instead.");
                turnOn.setText("I've switched debugging on — next"); break;
            case CHECK:
                heading.setText("2. Connect to your TV");
                description.setText("Type the TV's address from its network settings. Find my Fire TV searches Amazon devices only. Android / Google TV users: type the address.\n\nWhen the TV asks, tick Always allow and press Allow. A 4-digit code will then appear on the TV screen.");
                turnOn.setText("Connect to this TV"); break;
            case TV_CODE:
                heading.setText("3. Type the code on your TV");
                description.setText("Look at your TV — a message with a 4-digit code has appeared (on some TVs it's in the notifications). Type it below so we know this is your TV. After that, setup runs by itself.");
                turnOn.setText("Confirm code and set up my TV"); break;
            case SETUP:
                heading.setText("4. Setting up your TV");
                description.setText("We check what's already on the TV, install BM Remote Helper and remote control if needed, switch remote control on, then check everything again. Keep both devices awake.");
                turnOn.setText("Try again"); break;
            case DONE:
                heading.setText("TV setup confirmed");
                deviceHelp.setText("Which TV is this? Choose the same type as your ticket or order.");
                description.setText(confirmCode.length() > 0
                        ? "Type this code into the Remote setup tab on your ticket or order at bmsupport.uk. It works once and lasts 2 hours.\n\nThen press Connect on that tab to request screen sharing (if it asks, type the six-digit code shown on the TV instead). Use the button below to reopen BM Remote Helper for a new TV code."
                        : "Your TV is ready. Get your confirmation code, then type it on your ticket or order's Remote setup tab.");
                if (linkCode() != null) { description.setText("Your TV is ready and this app is linked to your ticket or order. Press the button to send everything to the website, then press Connect there."); turnOn.setText("Send to the website"); }
                else turnOn.setText(confirmCode.length() > 0 ? "New code" : "Get my confirmation code");
                break;
        }
        setBusy(busy);
    }

    private void start() {
        if (busy) return;
        if (wizard.step == SetupWizard.Step.DEBUGGING) { wizard.confirmDebugging(); say("", MUTED); render(); return; }
        final String host = address.getText().toString().trim();
        if (!SetupWizard.validHost(host)) { say("Type the TV's address exactly as it shows on the TV, e.g. 192.168.1.23.", WARN); return; }
        final SetupWizard.Step stage = wizard.step;
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
                final String issued = run == SetupWizard.Step.DONE && !linkedSent ? Enabler.requestConfirmCode(checks, selectedDevice, Enabler.readHelperCode(this, host)) : null;
                if (run == SetupWizard.Step.SETUP) {
                    checks = Enabler.checkExisting(this, host, progress);
                    if (!SetupWizard.ready(checks.adb, checks.helper, checks.control, checks.accessibility)) {
                        Enabler.enableUntil(this, host, 4, progress);
                        progress.step(0, "Checking everything on the TV one last time…");
                        checks = Enabler.checkExisting(this, host, progress);
                    }
                    if (SetupWizard.ready(checks.adb, checks.helper, checks.control, checks.accessibility)) {
                        progress.step(0, "Opening BM Remote Helper on your TV…");
                        Enabler.openCodeApp(this, host);
                    }
                }
                ui.post(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    setBusy(false);
                    if (run == SetupWizard.Step.SETUP) {
                        boolean ready = SetupWizard.ready(checks.adb, checks.helper, checks.control, checks.accessibility);
                        wizard.setupFinished(ready);
                        say(ready ? "✓ TV setup confirmed: both apps installed and remote control switched on. BM Remote Helper is open on your TV." : "The TV is not fully ready yet. Press Try again.", ready ? OK : WARN);
                    } else {
                        if (linkedSent) say("✓ Sent to your ticket or order. On the website, press Connect.", OK);
                        else { confirmCode.setText(issued.substring(0, 3) + "-" + issued.substring(3)); say("✓ Code ready. Type it on your ticket or order's Remote setup tab.", OK); }
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
                    if (existing == null) wizard.connected(code);
                    say("✓ Connected. Look for the 4-digit code on your TV.", OK); render(); });
            } catch (Exception e) {
                String message = Enabler.friendly(e);
                ui.post(() -> { if (!isFinishing() && !isDestroyed()) { setBusy(false); say(message, ACCENT); render(); turnOn.setText(existing == null ? "Try again" : turnOn.getText()); } });
            }
        });
    }

    /** Opens BM Remote Helper (the code app) on the TV so the customer can enter its code on the website. */
    private void openBmSupport() {
        if (busy) return;
        final String host = address.getText().toString().trim();
        if (!SetupWizard.validHost(host)) { say("Type the TV's address first.", WARN); return; }
        setBusy(true); say("Opening BM Remote Helper on your TV…", MUTED);
        io.execute(() -> {
            String msg = null;
            try { Enabler.openCodeApp(this, host); } catch (Exception e) { msg = Enabler.friendly(e); }
            final String err = msg;
            ui.post(() -> { if (isFinishing() || isDestroyed()) return; setBusy(false);
                say(err != null ? err : "✓ BM Remote Helper is open on your TV. Enter its six-digit code in your ticket or order's Remote setup tab on bmsupport.uk.", err != null ? ACCENT : OK); });
        });
    }

    private void confirmReset() {
        if (busy) return;
        new AlertDialog.Builder(this).setTitle("Reset setup?")
                .setMessage("Start again from debugging instructions and clear the saved TV address, device choice and confirmation code? Installed TV apps and this phone's TV authorization are kept.")
                .setNegativeButton("Cancel", null).setPositiveButton("Reset setup", (d, which) -> {
                    wizard.reset(); checks = null; device = null;
                    getSharedPreferences("tv", MODE_PRIVATE).edit().remove("host").remove("device").apply();
                    address.setText(""); confirmCode.setText(""); say("", MUTED); render();
                }).show();
    }

    /** Lists advertised Fire TVs, including those whose debugging port is closed. */
    private void scan() {
        if (busy) return;
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
                List<DiscoveredDevice> found = DeviceDiscovery.scan(base);
                ui.post(() -> {
                    setBusy(false);
                    if (isFinishing() || isDestroyed()) return;
                    if (found.isEmpty()) say("No Fire TV found. Keep the TV awake on the same Wi-Fi, or type the address from BM Remote Helper. Some TVs don't advertise themselves.", WARN);
                    else showDevices(found);
                });
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                ui.post(() -> { setBusy(false); say("Search stopped. Try again or type the TV address.", WARN); });
            } catch (Exception e) {
                ui.post(() -> { setBusy(false); say("Couldn't search this Wi-Fi. Try again or type the TV address.", WARN); });
            } finally { if (lock.isHeld()) lock.release(); }
        });
    }

    private void showDevices(List<DiscoveredDevice> devices) {
        CharSequence[] labels = new CharSequence[devices.size()];
        for (int i = 0; i < devices.size(); i++) labels[i] = devices.get(i).label();
        final int[] selected = {-1};
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Choose your Fire TV")
                .setSingleChoiceItems(labels, -1, (d, index) -> {
                    selected[0] = index;
                    ((AlertDialog) d).getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
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
        for (Button button : new Button[]{turnOn, find, amazonBtn, androidBtn, next, reset, back, openSupport, showAgain}) {
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
    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
