package uk.bmsupport.remote;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.List;
import org.json.JSONObject;

/**
 * The screen the customer sees: shows the pairing code, asks consent, then closes itself
 * once the help session is running (the session service keeps going in the background).
 */
public final class MainActivity extends Activity {
    private TextView title;
    private TextView code;
    private TextView info;
    private TextView status;
    private Button action;
    private Button skip;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean polling;
    private Session pending;
    private boolean skipControl;
    private boolean wasRunning;
    private String lastReportedIp = "-";

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (SessionService.isRunning() != wasRunning) render();
            main.postDelayed(this, 2000L);
        }
    };

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);

        // Background: the BM Support help illustration behind a dark scrim.
        FrameLayout root = new FrameLayout(this);
        ImageView bg = new ImageView(this);
        bg.setImageResource(R.drawable.help_bg);
        bg.setScaleType(ImageView.ScaleType.CENTER_CROP);
        root.addView(bg, new FrameLayout.LayoutParams(-1, -1));
        View scrim = new View(this);
        scrim.setBackgroundColor(Color.argb(0xA6, 0x08, 0x14, 0x1b));
        root.addView(scrim, new FrameLayout.LayoutParams(-1, -1));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(64), dp(48), dp(64), dp(48));
        GradientDrawable panelBg = new GradientDrawable();
        panelBg.setColor(Color.argb(0xD9, 0x16, 0x2a, 0x35));
        panelBg.setCornerRadius(dp(28));
        panel.setBackground(panelBg);
        LinearLayout.LayoutParams panelLp = new LinearLayout.LayoutParams(-1, -1);
        int m = dp(48);
        panelLp.setMargins(m, m, m, m);
        scroll.addView(panel, new FrameLayout.LayoutParams(-1, -1));
        root.addView(scroll);

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.bm_logo);
        logo.setAdjustViewBounds(true);
        panel.addView(logo, new LinearLayout.LayoutParams(dp(90), dp(90)));

        title = new TextView(this);
        title.setTextSize(30.0f);
        title.setGravity(Gravity.CENTER);
        title.setTextColor(Color.WHITE);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        panel.addView(title);

        code = new TextView(this);
        code.setTextSize(72.0f);
        code.setGravity(Gravity.CENTER);
        code.setTextColor(Color.WHITE);
        code.setTypeface(null, android.graphics.Typeface.BOLD);
        code.setLetterSpacing(0.3f);
        panel.addView(code);

        status = new TextView(this);
        status.setTextSize(22.0f);
        status.setGravity(Gravity.CENTER);
        status.setTextColor(0xFFFFD54F);
        status.setPadding(0, dp(16), 0, dp(16));
        status.setVisibility(View.GONE);
        panel.addView(status);

        action = new Button(this);
        action.setTextSize(20.0f);
        panel.addView(action);

        skip = new Button(this);
        skip.setTextSize(16.0f);
        skip.setText("Skip – screen share only");
        skip.setVisibility(View.GONE);
        panel.addView(skip);

        info = new TextView(this);
        info.setTextSize(18.0f);
        info.setGravity(Gravity.CENTER);
        info.setTextColor(0xFFE3ECF3);
        info.setPadding(0, dp(16), 0, dp(16));
        panel.addView(info);

        TextView version = new TextView(this);
        version.setTextSize(12.0f);
        version.setGravity(Gravity.CENTER);
        version.setTextColor(0xFF9FB3C8);
        version.setText("BM Remote Helper " + BuildConfig.VERSION_NAME);
        panel.addView(version);

        scroll.removeAllViews();
        scroll.addView(panel);
        setContentView(root);
    }

    @Override
    protected void onResume() {
        super.onResume();
        new Thread(() -> Control.INSTANCE.exportControlApk(this)).start();
        FireSetup.INSTANCE.setOnChange(() -> main.post(this::render));
        wasRunning = SessionService.isRunning();
        render();
        main.postDelayed(ticker, 2000L);
    }

    @Override
    protected void onPause() {
        super.onPause();
        polling = false;
        FireSetup.INSTANCE.setOnChange(null);
        main.removeCallbacks(ticker);
    }

    private void render() {
        action.setEnabled(true);
        skip.setVisibility(View.GONE);
        status.setVisibility(View.GONE);

        if (SessionService.isRunning()) {
            wasRunning = true;
            title.setText("Help session is on");
            code.setText("");
            status.setText("");
            info.setText("BM Support can see this screen and will talk you through it.\n\nYou can close this app — open it again any time to end the session.");
            action.setText("End session");
            action.setOnClickListener(v -> {
                SessionService.stopSession(this);
                render();
            });
        } else if (wasRunning) {
            // The session just ended while this screen was open: say so, then close the app.
            wasRunning = false;
            title.setText("Help session ended");
            code.setText("");
            info.setText("BM Support is no longer connected to this TV. This app will close now.");
            action.setVisibility(View.GONE);
            main.postDelayed(this::finish, 8000L);
            return;
        } else if (skipControl) {
            newCode();
        } else if (Control.INSTANCE.isFireTv(this)
                && (Control.INSTANCE.needsInstall(this) || !Control.INSTANCE.enabled(this))) {
            fireSetup();
        } else if (Control.INSTANCE.needsInstall(this)) {
            title.setText("Install remote control");
            code.setText("");
            String installMessage = Control.INSTANCE.getInstallMessage();
            String lead = installMessage == null ? "" : installMessage + "\n\n";
            info.setText(lead + "This lets BM Support press buttons on your TV while you allow a help session.\n"
                    + (Control.INSTANCE.canInstall(this)
                    ? "Press Install, then Install again on the next screen."
                    : "First allow BM Remote Helper to install apps, then come back here."));
            action.setText(Control.INSTANCE.canInstall(this) ? "Install" : "Allow installs");
            action.setOnClickListener(v -> {
                if (Control.INSTANCE.canInstall(this)) {
                    new Thread(() -> {
                        Throwable error = null;
                        try {
                            Control.INSTANCE.install(this);
                        } catch (Throwable t) {
                            error = t;
                        }
                        final Throwable fError = error;
                        main.post(() -> {
                            if (fError != null) {
                                String msg = String.valueOf(fError.getMessage());
                                // An old-key BM Remote Control can't be updated in place.
                                if (msg.contains("UPDATE_INCOMPATIBLE") || msg.contains("INSTALL_FAILED")) {
                                    msg = "An older BM Remote Control is installed. Open Settings > Apps, uninstall BM Remote Control, then press Install again.";
                                } else {
                                    msg = "Could not install: " + msg;
                                }
                                Control.INSTANCE.setInstallMessage(msg);
                                render();
                            }
                        });
                    }).start();
                } else {
                    try {
                        startActivity(Control.INSTANCE.unknownSourcesIntent(this));
                    } catch (Throwable ignore) {
                    }
                }
            });
            skipButton();
        } else if (!Control.INSTANCE.enabled(this) && Control.INSTANCE.isFireTv(this)) {
            fireSetup();
        } else if (!Control.INSTANCE.enabled(this)) {
            title.setText("Turn on remote control");
            code.setText("");
            info.setText("Press Open settings, choose BM Remote Control and switch it on, then press Back.\n\nSwitch greyed out? Go to Settings > Apps > BM Remote Control, press the 3-dot menu (or the menu button) and choose Allow restricted settings, then try again.");
            action.setText("Open settings");
            action.setOnClickListener(v -> {
                try {
                    startActivity(Control.INSTANCE.accessibilityIntent());
                } catch (Throwable ignore) {
                }
            });
            skipButton();
        } else {
            newCode();
        }

        action.setVisibility(View.VISIBLE);
        code.setVisibility(code.getText().length() == 0 ? View.GONE : View.VISIBLE);
    }

    private void fireSetup() {
        title.setText("Turn on remote control");
        code.setText("");
        List<String> ips = Control.INSTANCE.allIps(this);
        String ip = ips.isEmpty() ? null : ips.get(0);
        if (ip != null && !ip.equals(lastReportedIp)) {
            lastReportedIp = ip;
            Diag.INSTANCE.send("fire_setup_screen", "ips=" + (ips.isEmpty() ? "none" : android.text.TextUtils.join(",", ips))
                    + " adb=" + Control.INSTANCE.adbEnabled(this));
        }
        boolean adbOn = Control.INSTANCE.adbEnabled(this);
        status.setVisibility(View.VISIBLE);
        if (FireSetup.INSTANCE.getBusy()) {
            status.setText(FireSetup.INSTANCE.getProgress() == null ? "Working…" : FireSetup.INSTANCE.getProgress());
        } else if (FireSetup.INSTANCE.getMessage() != null) {
            status.setText(FireSetup.INSTANCE.getMessage());
        } else {
            status.setText("");
        }
        StringBuilder text = new StringBuilder();
        text.append("This TV's address:  ").append(ip == null ? "not found" : ip);
        if (!adbOn) {
            text.append("\n\nADB debugging is off. Switch on Settings > My Fire TV > Developer Options > ADB debugging, then press Check again.");
        } else if (!FireSetup.INSTANCE.getBusy()) {
            text.append("\n\nPress Turn on remote control. If an \"Allow debugging?\" box appears, choose Allow.");
        }
        info.setText(text.toString());
        action.setText(FireSetup.INSTANCE.getBusy() ? "Working…" : (adbOn ? "Turn on remote control" : "Check again"));
        action.setEnabled(!FireSetup.INSTANCE.getBusy());
        action.setOnClickListener(v -> {
            if (!Control.INSTANCE.adbEnabled(this)) {
                render();
                return;
            }
            FireSetup.INSTANCE.start(this, () -> main.post(this::render));
        });
        skipButton();
    }

    private void skipButton() {
        skip.setVisibility(View.VISIBLE);
        skip.setOnClickListener(v -> {
            skipControl = true;
            render();
        });
    }

    private void newCode() {
        title.setText("Read this code to BM Support");
        code.setText("······");
        code.setVisibility(View.VISIBLE);
        info.setText("Getting a code…");
        action.setText("New code");
        action.setOnClickListener(v -> newCode());
        new Thread(() -> {
            JSONObject res = null;
            try {
                String model = Build.MODEL == null ? "TV" : Build.MODEL;
                res = Api.INSTANCE.post(new JSONObject().put("action", "pair").put("device_name", model));
            } catch (Throwable ignore) {
            }
            final JSONObject fRes = res;
            main.post(() -> {
                if (fRes == null || !fRes.has("code")) {
                    String err = fRes == null ? null : fRes.optString("error", null);
                    info.setText(err == null || err.isEmpty() ? "No internet connection. Try again." : err);
                    return;
                }
                pending = new Session(fRes.optString("session_id"), fRes.optString("device_token"), fRes.optString("topic"));
                code.setText(fRes.optString("code"));
                String extra = "";
                if (Control.INSTANCE.isFireTv(this) && !Control.INSTANCE.enabled(this)) {
                    String wifi = Control.INSTANCE.wifiIp(this);
                    extra = "\n\nRemote control is off on this TV. To switch it on, use the BM TV Enabler app on your phone or computer with this TV's address: "
                            + (wifi == null ? "not found" : wifi);
                }
                info.setText("The code works for 10 minutes." + extra);
                poll();
            });
        }).start();
    }

    private void poll() {
        final Session s = pending;
        if (s == null) return;
        polling = true;
        new Thread(() -> {
            while (polling) {
                try {
                    Thread.sleep(2000L);
                } catch (InterruptedException e) {
                    break;
                }
                String st;
                try {
                    st = Api.INSTANCE.session("status", s).optString("status");
                } catch (Throwable t) {
                    continue;
                }
                if ("claimed".equals(st)) {
                    polling = false;
                    main.post(() -> askConsent(s));
                } else if ("expired".equals(st)) {
                    polling = false;
                    main.post(() -> {
                        info.setText("That code expired. Press New code.");
                        code.setText("");
                        code.setVisibility(View.GONE);
                    });
                }
            }
        }).start();
    }

    private void askConsent(final Session s) {
        new AlertDialog.Builder(this)
                .setTitle("Allow BM Support to control this TV?")
                .setMessage("A BM Support staff member will see your screen and, if remote control is on, press buttons for you. You can end it at any time from this app.")
                .setCancelable(false)
                .setPositiveButton("Allow", (d, i) -> {
                    new Thread(() -> {
                        try {
                            Api.INSTANCE.session("consent", s, body -> body.put("allow", true));
                        } catch (Throwable ignore) {
                        }
                    }).start();
                    SessionService.setSession(s);
                    startActivityForResult(
                            ((MediaProjectionManager) getSystemService(MediaProjectionManager.class)).createScreenCaptureIntent(), 7);
                })
                .setNegativeButton("Don't allow", (d, i) -> {
                    new Thread(() -> {
                        try {
                            Api.INSTANCE.session("consent", s, body -> body.put("allow", false));
                        } catch (Throwable ignore) {
                        }
                    }).start();
                    final Realtime rt = new Realtime(s.topic, (ev, p) -> {
                    });
                    rt.connect();
                    try {
                        rt.send("state", new JSONObject().put("consent", "declined"));
                    } catch (Throwable ignore) {
                    }
                    main.postDelayed(rt::close, 2000L);
                    render();
                })
                .show();
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != 7) return;
        SessionService.setProjection(res == RESULT_OK ? data : null);
        Intent intent = new Intent(this, SessionService.class);
        if (Build.VERSION.SDK_INT >= 26) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
        // The code has been read and the session is running: show the connected screen
        // briefly, then close the app. The session service keeps running in the background.
        main.postDelayed(() -> {
            render();
            main.postDelayed(this::finish, 8000L);
        }, 500L);
    }
}
