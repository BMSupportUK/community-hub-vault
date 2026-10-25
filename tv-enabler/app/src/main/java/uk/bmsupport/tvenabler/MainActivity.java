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
    private static final String[] STEPS = {"Connect to the TV", "Press Allow on the TV", "Install BM Remote Helper on the TV", "Install remote control", "Switch remote control on", "Done"};
    private static final int BG = Color.parseColor("#0F1220"), FG = Color.WHITE, MUTED = Color.parseColor("#A9B0C7"),
            ACCENT = Color.parseColor("#E23B4E"), OK = Color.parseColor("#3CCB7F"), WARN = Color.parseColor("#F5C04A");
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private EditText address, setupCode;
    private Button turnOn, find, amazonBtn, androidBtn;
    private TextView status, deviceHelp;
    private String device;
    private final List<TextView> stepViews = new ArrayList<>();
    private boolean busy;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        SharedPreferences prefs = getSharedPreferences("tv", MODE_PRIVATE);
        int pad = dp(20);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(pad, dp(32), pad, pad);
        col.setBackgroundColor(BG);

        col.addView(text("BM TV Enabler", 26, FG, true));
        col.addView(text("Sets up your TV for BM Support: it installs BM Remote Helper and remote control on the TV for you, then switches remote control on.", 15, MUTED, false));

        col.addView(text("Which TV are you setting up?", 15, FG, true));
        LinearLayout pick = new LinearLayout(this);
        pick.setOrientation(LinearLayout.HORIZONTAL);
        amazonBtn = button("Amazon Fire TV", Color.parseColor("#2A3050"));
        androidBtn = button("Android / Google TV", Color.parseColor("#2A3050"));
        LinearLayout.LayoutParams halfL = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
        halfL.rightMargin = dp(6);
        LinearLayout.LayoutParams halfR = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
        halfR.leftMargin = dp(6);
        pick.addView(amazonBtn, halfL);
        pick.addView(androidBtn, halfR);
        col.addView(pick, lp(dp(4)));
        deviceHelp = text("", 14, MUTED, false);
        col.addView(deviceHelp, lp(dp(2)));
        amazonBtn.setOnClickListener(v -> pickDevice("amazon"));
        androidBtn.setOnClickListener(v -> pickDevice("android"));
        device = prefs.getString("device", null);
        if (device != null) pickDevice(device);
        else deviceHelp.setText("Choose one — the setting to switch on is different on each.");

        col.addView(text("1. Switch on the setting above on the TV.\n2. Make sure this phone is on the same Wi-Fi as the TV.\n3. Press Find my TV and choose your TV, or type its address below.\n4. Press Turn on remote control — everything on the TV is installed for you.", 15, FG, false));

        col.addView(text("Your setup code from the Remote setup tab on your support ticket or order:", 15, FG, false));
        setupCode = new EditText(this);
        setupCode.setHint("8-digit setup code");
        setupCode.setHintTextColor(MUTED); setupCode.setTextColor(FG); setupCode.setTextSize(20);
        setupCode.setInputType(InputType.TYPE_CLASS_NUMBER);
        setupCode.setFilters(new android.text.InputFilter[]{ new android.text.InputFilter.LengthFilter(9) });
        col.addView(setupCode, lp(dp(8)));

        address = new EditText(this);
        address.setHint("TV address, e.g. 192.168.1.23");
        address.setHintTextColor(MUTED);
        address.setTextColor(FG);
        address.setTextSize(20);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        address.setKeyListener(android.text.method.DigitsKeyListener.getInstance("0123456789."));
        address.setText(prefs.getString("host", ""));
        col.addView(address, lp(dp(16)));

        turnOn = button("Turn on remote control", ACCENT);
        turnOn.setOnClickListener(v -> start());
        col.addView(turnOn, lp(dp(12)));
        find = button("Find my TV", Color.parseColor("#2A3050"));
        find.setOnClickListener(v -> scan());
        col.addView(find, lp(dp(8)));

        status = text("", 15, WARN, false);
        col.addView(status, lp(dp(12)));
        for (String s : STEPS) { TextView t = text("○  " + s, 16, MUTED, false); stepViews.add(t); col.addView(t, lp(dp(6))); }

        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(BG);
        sv.setFillViewport(true);
        sv.addView(col);
        setContentView(sv);
    }

    private void pickDevice(String d) {
        device = d;
        getSharedPreferences("tv", MODE_PRIVATE).edit().putString("device", d).apply();
        boolean amazon = d.equals("amazon");
        amazonBtn.setBackgroundColor(amazon ? ACCENT : Color.parseColor("#2A3050"));
        androidBtn.setBackgroundColor(amazon ? Color.parseColor("#2A3050") : ACCENT);
        deviceHelp.setText(amazon
            ? "On the TV: Settings › My Fire TV › About — press the device name 7 times, then Settings › My Fire TV › Developer options › ADB debugging ON."
            : "On the TV: Settings › System › About — press Android TV OS build 7 times, then Settings › System › Developer options › Network debugging ON (or Wireless debugging ON if your TV has that instead).");
    }

    private void start() {
        if (busy) return;
        if (device == null) { say("First choose which TV you're setting up: Amazon Fire TV or Android / Google TV.", WARN); return; }
        String host = address.getText().toString().trim();
        if (!host.matches("^\\d{1,3}(\\.\\d{1,3}){3}$")) { say("Type the TV's address exactly as it shows on the TV, e.g. 192.168.1.23", WARN); return; }
        String sc = setupCode.getText().toString().replaceAll("\\D", "");
        if (sc.length() != 8) { say("Type the 8-digit setup code shown on your support ticket's Remote setup tab.", WARN); return; }
        getSharedPreferences("tv", MODE_PRIVATE).edit().putString("host", host).apply();
        setBusy(true);
        resetSteps();
        say("Working… keep this app open.", MUTED);
        io.execute(() -> {
            try {
                Enabler.Checks c = Enabler.enable(this, host, (i, msg) -> ui.post(() -> { mark(i); say(msg, i == 1 ? WARN : MUTED); }));
                ui.post(() -> say("Telling BM Support your TV is ready…", MUTED));
                String err = Enabler.report(sc, c, device);
                if (err != null) { ui.post(() -> { say("Remote control is on, but: " + err, ACCENT); turnOn.setText("Try again"); setBusy(false); }); return; }
                ui.post(() -> { for (int i = 0; i < STEPS.length; i++) done(i); say("Remote control is on and BM Support has been told. BM Remote Helper is now open on your TV — type its six-digit code on your ticket.", OK); turnOn.setText("Turn on remote control"); setBusy(false); });
            } catch (Exception e) {
                String m = Enabler.friendly(e);
                ui.post(() -> { say(m, ACCENT); turnOn.setText("Try again"); setBusy(false); });
            }
        });
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

    private void setBusy(boolean b) { busy = b; turnOn.setEnabled(!b); find.setEnabled(!b); turnOn.setAlpha(b ? .5f : 1f); find.setAlpha(b ? .5f : 1f); }
    private void resetSteps() { for (int i = 0; i < STEPS.length; i++) { stepViews.get(i).setText("○  " + STEPS[i]); stepViews.get(i).setTextColor(MUTED); } }
    private void mark(int i) { for (int j = 0; j < i; j++) done(j); stepViews.get(i).setText("●  " + STEPS[i]); stepViews.get(i).setTextColor(FG); }
    private void done(int i) { stepViews.get(i).setText("✓  " + STEPS[i]); stepViews.get(i).setTextColor(OK); }
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
