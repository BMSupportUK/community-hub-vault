package uk.bmsupport.tvenabler;

import android.app.Activity;
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

import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class MainActivity extends Activity {
    private static final String[] STEPS = {"Connect to the TV", "Press Allow on the TV", "Install remote control", "Switch remote control on", "Done"};
    private static final int BG = Color.parseColor("#0F1220"), FG = Color.WHITE, MUTED = Color.parseColor("#A9B0C7"),
            ACCENT = Color.parseColor("#E23B4E"), OK = Color.parseColor("#3CCB7F"), WARN = Color.parseColor("#F5C04A");
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private EditText address;
    private Button turnOn, find;
    private TextView status;
    private final List<TextView> stepViews = new ArrayList<>();
    private boolean busy;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        int pad = dp(20);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(pad, dp(32), pad, pad);
        col.setBackgroundColor(BG);

        col.addView(text("BM TV Enabler", 26, FG, true));
        col.addView(text("Switches on BM Remote Control on your Amazon Fire TV so BM Support staff can help you with the remote.", 15, MUTED, false));
        col.addView(text("1. Open BM Remote Helper on the TV — it shows the TV's address.\n2. Make sure this phone is on the same Wi-Fi as the TV.\n3. Type the address below and press Turn on remote control.", 15, FG, false));

        address = new EditText(this);
        address.setHint("TV address, e.g. 192.168.1.23");
        address.setHintTextColor(MUTED);
        address.setTextColor(FG);
        address.setTextSize(20);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        address.setKeyListener(android.text.method.DigitsKeyListener.getInstance("0123456789."));
        SharedPreferences prefs = getSharedPreferences("tv", MODE_PRIVATE);
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

    private void start() {
        if (busy) return;
        String host = address.getText().toString().trim();
        if (!host.matches("^\\d{1,3}(\\.\\d{1,3}){3}$")) { say("Type the TV's address exactly as it shows on the TV, e.g. 192.168.1.23", WARN); return; }
        getSharedPreferences("tv", MODE_PRIVATE).edit().putString("host", host).apply();
        setBusy(true);
        resetSteps();
        say("Working… keep this app open.", MUTED);
        io.execute(() -> {
            try {
                Enabler.enable(this, host, (i, msg) -> ui.post(() -> { mark(i); say(msg, i == 1 ? WARN : MUTED); }));
                ui.post(() -> { for (int i = 0; i < STEPS.length; i++) done(i); say("Remote control is on. You can close this app.", OK); turnOn.setText("Turn on remote control"); setBusy(false); });
            } catch (Exception e) {
                String m = Enabler.friendly(e);
                ui.post(() -> { say(m, ACCENT); turnOn.setText("Try again"); setBusy(false); });
            }
        });
    }

    /** Looks for a device with Wi-Fi debugging open (port 5555) on this phone's network. */
    private void scan() {
        if (busy) return;
        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
        int ip = wm == null ? 0 : wm.getConnectionInfo().getIpAddress();
        if (ip == 0) { say("Connect this phone to your home Wi-Fi first.", WARN); return; }
        String base = (ip & 0xff) + "." + ((ip >> 8) & 0xff) + "." + ((ip >> 16) & 0xff) + ".";
        setBusy(true);
        say("Looking for your TV on the Wi-Fi…", MUTED);
        io.execute(() -> {
            ExecutorService pool = Executors.newFixedThreadPool(32);
            List<String> found = java.util.Collections.synchronizedList(new ArrayList<>());
            for (int i = 1; i < 255; i++) {
                String h = base + i;
                pool.execute(() -> { try (Socket s = new Socket()) { s.connect(new InetSocketAddress(h, 5555), 400); found.add(h); } catch (Exception ignored) { } });
            }
            pool.shutdown();
            try { pool.awaitTermination(30, TimeUnit.SECONDS); } catch (InterruptedException ignored) { }
            ui.post(() -> {
                setBusy(false);
                if (found.isEmpty()) say("No TV found. Check ADB debugging is ON on the TV, or type the address from BM Remote Helper.", WARN);
                else { address.setText(found.get(0)); say(found.size() == 1 ? "Found your TV. Press Turn on remote control." : "Found " + found.size() + " devices — check the address matches BM Remote Helper.", OK); }
            });
        });
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
