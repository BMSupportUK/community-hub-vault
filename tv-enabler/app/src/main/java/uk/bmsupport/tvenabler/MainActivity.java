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
    private EditText address, setupCode;
    private Button turnOn, find, amazonBtn, androidBtn, next, reset, back, openSupport;
    private TextView status, deviceHelp, heading, description;
    private LinearLayout devicePick;
    private String device;
    private Enabler.Checks checks;
    private boolean busy, websiteSynced;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        SharedPreferences prefs = getSharedPreferences("tv", MODE_PRIVATE);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(20), dp(32), dp(20), dp(24));
        col.setBackgroundColor(BG);
        col.addView(text("BM TV Enabler", 26, FG, true));
        col.addView(text("TV setup · 1.14", 14, MUTED, false));
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
        setupCode = new EditText(this);
        setupCode.setHint("8-digit ticket or order setup code");
        setupCode.setHintTextColor(MUTED); setupCode.setTextColor(FG); setupCode.setTextSize(20);
        setupCode.setInputType(InputType.TYPE_CLASS_NUMBER);
        setupCode.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(8)});
        col.addView(setupCode, lp(dp(12)));
        openSupport = button("Open BM Remote Helper on TV to show my code", Color.parseColor("#2A3050"));
        openSupport.setOnClickListener(v -> openBmSupport()); col.addView(openSupport, lp(dp(8)));
        find = button("Find my Fire TV", Color.parseColor("#2A3050"));
        find.setOnClickListener(v -> scan()); col.addView(find, lp(dp(8)));
        status = text("", 16, WARN, false); col.addView(status, lp(dp(12)));
        turnOn = button("", ACCENT); turnOn.setOnClickListener(v -> start()); col.addView(turnOn, lp(dp(12)));
        next = button("Done — next step", ACCENT);
        next.setOnClickListener(v -> { wizard.next(); say("", MUTED); render(); }); col.addView(next, lp(dp(8)));
        back = button("Back to debugging instructions", Color.parseColor("#2A3050"));
        back.setOnClickListener(v -> { if (!busy) { wizard.reset(); checks = null; websiteSynced = false; say("", MUTED); render(); } });
        col.addView(back, lp(dp(8)));
        reset = button("Reset setup", Color.parseColor("#2A3050"));
        reset.setOnClickListener(v -> confirmReset()); col.addView(reset, lp(dp(20)));
        ScrollView sv = new ScrollView(this); sv.setBackgroundColor(BG); sv.setFillViewport(true); sv.addView(col); setContentView(sv);
        // A remembered platform/address is a convenience, never proof that a TV is ready.
        device = prefs.getString("device", null);
        if (!"amazon".equals(device) && !"android".equals(device)) device = null;
        render();
    }

    private void pickDevice(String d) {
        if (busy) return;
        device = d;
        getSharedPreferences("tv", MODE_PRIVATE).edit().putString("device", d).apply();
        render();
    }

    private void render() {
        SetupWizard.Step s = wizard.step;
        devicePick.setVisibility(s == SetupWizard.Step.DEVICE ? View.VISIBLE : View.GONE);
        deviceHelp.setVisibility(s == SetupWizard.Step.DEVICE ? View.VISIBLE : View.GONE);
        address.setVisibility(s == SetupWizard.Step.CHECK ? View.VISIBLE : View.GONE);
        find.setVisibility(s == SetupWizard.Step.CHECK ? View.VISIBLE : View.GONE);
        setupCode.setVisibility(s != SetupWizard.Step.DEBUGGING && s != SetupWizard.Step.DEVICE ? View.VISIBLE : View.GONE);
        openSupport.setVisibility((s == SetupWizard.Step.REPORT || s == SetupWizard.Step.DONE) && wizard.ready ? View.VISIBLE : View.GONE);
        next.setVisibility(wizard.completed ? View.VISIBLE : View.GONE);
        turnOn.setVisibility(wizard.completed ? View.GONE : View.VISIBLE);
        next.setText(s == SetupWizard.Step.REPORT ? "TV confirmed — finish setup" : "Done — next step");
        back.setVisibility(s == SetupWizard.Step.CHECK && !wizard.completed ? View.VISIBLE : View.GONE);
        amazonBtn.setBackgroundColor("amazon".equals(device) ? ACCENT : Color.parseColor("#2A3050"));
        androidBtn.setBackgroundColor("android".equals(device) ? ACCENT : Color.parseColor("#2A3050"));
        switch (s) {
            case DEBUGGING:
                heading.setText("1. Enable TV debugging");
                description.setText("Put this phone and your TV on the same Wi-Fi. Switch on the setting for your TV:\n\nAmazon Fire TV\nSettings › My Fire TV › About — press the device name 7 times. Go back to Developer options and switch ADB debugging ON.\n\nAndroid / Google TV\nSettings › System › About — press Android TV OS build 7 times. Go back to Developer options and switch Network debugging ON, or Wireless debugging ON if your TV has that instead.");
                turnOn.setText("I've switched debugging on — next"); break;
            case CHECK:
                heading.setText("2. Check your TV");
                description.setText("Type the TV's address from its network settings. Find my Fire TV searches Amazon devices only. Android / Google TV users: type the address.\n\nWe'll check whether the apps and permissions are already set up. If they are, BM Remote Helper opens straight away — nothing is reinstalled.\n\nOptional: enter the eight-digit setup code from your ticket or order's Remote setup tab to send checked progress there. No website code? You can still finish TV setup.");
                turnOn.setText("Check this TV"); break;
            case DEVICE:
                heading.setText("3. Confirm your TV type");
                description.setText(wizard.ready ? "Your TV is ready and its code app is open. Choose the same TV type as your ticket or order to confirm setup with BM Support." : "Choose the TV you're setting up. We'll install BM Remote Helper, install remote control, then activate it — one step at a time.");
                deviceHelp.setText(device == null ? "Choose Amazon Fire TV or Android / Google TV." : "Selected: " + ("amazon".equals(device) ? "Amazon Fire TV" : "Android / Google TV") + ". Keep debugging switched on.");
                turnOn.setText("Confirm device — next"); break;
            case HELPER:
                heading.setText("4. Install BM Remote Helper");
                description.setText("The phone downloads BM Remote Helper and sends it to the TV over Wi-Fi. We then open it on the TV. Keep both devices awake; press Allow on the TV if asked.");
                turnOn.setText("Install and open Helper"); break;
            case CONTROL:
                heading.setText("5. Install remote control");
                description.setText("The phone extracts the remote-control app bundled with BM Remote Helper, sends it to the TV and installs it. Existing installed apps are kept.");
                turnOn.setText("Install remote control"); break;
            case ACTIVATE:
                heading.setText("6. Activate remote control");
                description.setText("We'll enable BM Remote Control's accessibility permission and check it on the TV, then open BM Remote Helper so your code is visible.");
                turnOn.setText("Activate and check permissions"); break;
            case REPORT:
                heading.setText(wizard.ready ? "3. Confirm TV setup" : "7. Confirm TV setup");
                description.setText("We'll check the TV one last time: BM Remote Helper installed, remote control installed, and its permission switched on. If everything checks out, setup is finished and BM Remote Helper stays open on the TV with your six-digit screen-share code.\n\nThis confirms setup inside this app. An eight-digit website linking code is optional — it is not needed to finish TV setup.");
                turnOn.setText("Check and confirm TV setup"); break;
            case DONE:
                heading.setText("TV setup confirmed");
                description.setText((websiteSynced ? "Your ticket or order has received the TV checks. " : "Your TV is ready. Website linking is separate: enter the optional eight-digit setup code below and send the checks to your ticket or order. ") + "Then enter the six-digit code shown on the TV in the website's Remote setup tab to request screen sharing.\n\nUse the button below to reopen BM Remote Helper for a new code. Reset setup starts again without uninstalling TV apps or removing authorization.");
                turnOn.setText(websiteSynced ? "Send TV checks again" : "Send TV checks to my ticket or order"); break;
        }
        setBusy(busy);
    }

    private void start() {
        if (busy) return;
        if (wizard.step == SetupWizard.Step.DEBUGGING) { wizard.confirmDebugging(); say("", MUTED); render(); return; }
        if (wizard.step == SetupWizard.Step.DEVICE) {
            if (device == null) { say("Choose which TV you're setting up first.", WARN); return; }
            wizard.chooseDevice(); say("", MUTED); render(); return;
        }
        final String host = address.getText().toString().trim();
        if (!SetupWizard.validHost(host)) { say("Type the TV's address exactly as it shows on the TV, e.g. 192.168.1.23.", WARN); return; }
        final SetupWizard.Step stage = wizard.step;
        final String selectedDevice = device;
        final String code = setupCode.getText().toString().replaceAll("\\D", "");
        if (stage == SetupWizard.Step.DONE && (code.length() != 8 || checks == null || !wizard.ready)) {
            say("Enter the current eight-digit setup code from your ticket or order's Remote setup tab.", WARN); return;
        }
        getSharedPreferences("tv", MODE_PRIVATE).edit().putString("host", host).apply();
        setBusy(true); say(stage == SetupWizard.Step.DONE ? "Sending checked TV setup to your ticket or order…" : "Checking your TV… keep this app open and watch your TV for an Allow box.", MUTED);
        io.execute(() -> {
            try {
                Enabler.Progress progress = (i, msg) -> ui.post(() -> { if (!isFinishing() && !isDestroyed()) say(msg, i == 1 ? WARN : MUTED); });
                if (stage == SetupWizard.Step.DONE) {
                    String err = Enabler.report(code, checks, null);
                    if (err != null) throw new IllegalStateException(err);
                } else {
                    checks = stage == SetupWizard.Step.CHECK || stage == SetupWizard.Step.REPORT ? Enabler.checkExisting(this, host, progress)
                            : Enabler.enableUntil(this, host, stage == SetupWizard.Step.HELPER ? 2 : stage == SetupWizard.Step.CONTROL ? 3 : 4, progress);
                    // Already-set-up TV: open the code app once, straight away. The confirm step only re-checks.
                    if (stage == SetupWizard.Step.CHECK && SetupWizard.ready(checks.adb, checks.helper, checks.control, checks.accessibility)) {
                        progress.step(5, "This TV is already set up. Opening BM Remote Helper to show your code…");
                        Enabler.openCodeApp(this, host);
                    }
                }
                // Only measured snapshots are sent. A website error never undoes a successful TV operation.
                final String syncError = stage != SetupWizard.Step.DONE && code.length() == 8
                        ? Enabler.report(code, checks, stage == SetupWizard.Step.CHECK || stage == SetupWizard.Step.REPORT ? null : selectedDevice) : null;
                final boolean sent = stage == SetupWizard.Step.DONE || (code.length() == 8 && syncError == null);
                ui.post(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    setBusy(false);
                    websiteSynced = sent;
                    if (stage == SetupWizard.Step.CHECK) {
                        boolean ready = SetupWizard.ready(checks.adb, checks.helper, checks.control, checks.accessibility);
                        wizard.checked(ready);
                        say(ready ? "✓ This TV is already set up. BM Remote Helper is open on your TV with your code." : "✓ TV checked. Some apps or permissions still need setting up. Confirm to continue.", OK);
                    } else if (stage == SetupWizard.Step.REPORT) {
                        boolean ready = SetupWizard.ready(checks.adb, checks.helper, checks.control, checks.accessibility);
                        wizard.confirmTv(ready);
                        say(ready ? "✓ TV setup confirmed: both apps installed and remote-control permission enabled. Your TV code app is open. Press finish." : "The TV is not fully ready. Go back to debugging instructions and check setup again.", ready ? OK : WARN);
                    } else if (stage == SetupWizard.Step.DONE) {
                        say("✓ Your ticket or order has received the checked TV setup. Enter the six-digit TV code on its Remote setup tab.", OK);
                    } else {
                        wizard.operationCompleted();
                        say("✓ This step is complete and checked on the TV. Confirm to continue.", OK);
                    }
                    if (syncError != null) say("TV step checked. Website sync pending: " + syncError + " You can finish TV setup and retry linking on the final screen.", WARN);
                    render();
                });
            } catch (Exception e) {
                String message = Enabler.friendly(e);
                ui.post(() -> { if (!isFinishing() && !isDestroyed()) { setBusy(false); say(message, ACCENT); turnOn.setText("Try again"); } });
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
                .setMessage("Start again from debugging instructions and clear the saved TV address, device choice and entered setup code? Installed TV apps and this phone's TV authorization are kept.")
                .setNegativeButton("Cancel", null).setPositiveButton("Reset setup", (d, which) -> {
                    wizard.reset(); checks = null; device = null; websiteSynced = false;
                    getSharedPreferences("tv", MODE_PRIVATE).edit().remove("host").remove("device").apply();
                    address.setText(""); setupCode.setText(""); say("", MUTED); render();
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
        for (Button button : new Button[]{turnOn, find, amazonBtn, androidBtn, next, reset, back, openSupport}) {
            button.setEnabled(!b); button.setAlpha(b ? .5f : 1f);
        }
        address.setEnabled(!b); setupCode.setEnabled(!b);
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
