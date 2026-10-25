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
    private Button turnOn, find, amazonBtn, androidBtn, next, reset, back;
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
        col.addView(text("TV setup · 1.11", 14, MUTED, false));
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
        find = button("Find my Fire TV", Color.parseColor("#2A3050"));
        find.setOnClickListener(v -> scan()); col.addView(find, lp(dp(8)));
        status = text("", 16, WARN, false); col.addView(status, lp(dp(12)));
        turnOn = button("", ACCENT); turnOn.setOnClickListener(v -> start()); col.addView(turnOn, lp(dp(12)));
        next = button("Done — next step", ACCENT);
        next.setOnClickListener(v -> { wizard.next(); say("", MUTED); render(); }); col.addView(next, lp(dp(8)));
        back = button("Back to debugging instructions", Color.parseColor("#2A3050"));
        back.setOnClickListener(v -> { if (!busy) { wizard.reset(); checks = null; say("", MUTED); render(); } });
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
        setupCode.setVisibility(s == SetupWizard.Step.REPORT ? View.VISIBLE : View.GONE);
        next.setVisibility(wizard.completed ? View.VISIBLE : View.GONE);
        turnOn.setVisibility(wizard.completed || s == SetupWizard.Step.DONE ? View.GONE : View.VISIBLE);
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
                description.setText("Type the TV's address from its network settings. Find my Fire TV searches Amazon devices only. Android / Google TV users: type the address.\n\nWe'll check whether the apps and permissions are already set up. If they are, BM Remote Helper opens straight away on the TV to show your six-digit code — nothing is reinstalled.");
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
                description.setText("We'll enable BM Remote Control's accessibility permission and check it on the TV, then open BM Remote Helper again so your code is visible.");
                turnOn.setText("Activate and check permissions"); break;
            case REPORT:
                heading.setText(wizard.ready ? "4. Confirm with BM Support" : "7. Confirm with BM Support");
                description.setText("Enter the eight-digit setup code from your ticket or order's Remote setup tab. We'll send the TV's verified checks to BM Support. Then enter the six-digit code shown by BM Remote Helper on your TV into that same Remote setup tab.");
                turnOn.setText("Confirm TV setup"); break;
            case DONE:
                heading.setText("Setup complete");
                description.setText("BM Support has received your TV's setup checks. Enter the six-digit TV code in your ticket or order's Remote setup tab to request screen sharing.\n\nUse Reset setup if you change TV, Wi-Fi or permissions. It starts this wizard again without uninstalling apps or removing this phone's TV authorization."); break;
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
        if (stage == SetupWizard.Step.REPORT && (code.length() != 8 || checks == null || selectedDevice == null)) {
            say("Enter the current eight-digit setup code from your ticket or order's Remote setup tab.", WARN); return;
        }
        getSharedPreferences("tv", MODE_PRIVATE).edit().putString("host", host).apply();
        setBusy(true); say("Working… keep this app open and watch your TV for an Allow box.", MUTED);
        io.execute(() -> {
            try {
                Enabler.Progress progress = (i, msg) -> ui.post(() -> { if (!isFinishing() && !isDestroyed()) say(msg, i == 1 ? WARN : MUTED); });
                if (stage == SetupWizard.Step.REPORT) {
                    String err = Enabler.report(code, checks, selectedDevice);
                    if (err != null) throw new IllegalStateException(err);
                } else {
                    checks = stage == SetupWizard.Step.CHECK ? Enabler.checkExisting(this, host, progress)
                            : Enabler.enableUntil(this, host, stage == SetupWizard.Step.HELPER ? 2 : stage == SetupWizard.Step.CONTROL ? 3 : 4, progress);
                }
                ui.post(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    setBusy(false);
                    if (stage == SetupWizard.Step.CHECK) {
                        boolean ready = SetupWizard.ready(checks.adb, checks.helper, checks.control, checks.accessibility);
                        wizard.checked(ready);
                        say(ready ? "✓ This TV is already set up. BM Remote Helper is open on your TV with your code." : "✓ TV checked. Some apps or permissions still need setting up. Confirm to continue.", OK);
                    } else {
                        wizard.operationCompleted();
                        say(stage == SetupWizard.Step.REPORT ? "✓ BM Support has received your TV checks. Confirm to finish." : "✓ This step is complete and checked on the TV. Confirm to continue.", OK);
                    }
                    render();
                });
            } catch (Exception e) {
                String message = Enabler.friendly(e);
                ui.post(() -> { if (!isFinishing() && !isDestroyed()) { setBusy(false); say(message, ACCENT); turnOn.setText("Try again"); } });
            }
        });
    }

    private void confirmReset() {
        if (busy) return;
        new AlertDialog.Builder(this).setTitle("Reset setup?")
                .setMessage("Start again from debugging instructions and clear the saved TV address, device choice and entered setup code? Installed TV apps and this phone's TV authorization are kept.")
                .setNegativeButton("Cancel", null).setPositiveButton("Reset setup", (d, which) -> {
                    wizard.reset(); checks = null; device = null;
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
        for (Button button : new Button[]{turnOn, find, amazonBtn, androidBtn, next, reset, back}) {
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
