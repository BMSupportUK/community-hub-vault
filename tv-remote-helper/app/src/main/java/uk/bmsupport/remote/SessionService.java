package uk.bmsupport.remote;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.provider.Settings;
import android.view.WindowManager;
import android.widget.TextView;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Runs a live help session: realtime channel, screen share, remote-control forwarding, on-screen banner. */
public final class SessionService extends Service {
    private static final Set<String> KEYS = new HashSet<>(Arrays.asList(
            "up", "down", "left", "right", "ok", "back", "home", "play_pause", "volume_up", "volume_down"));

    private static Session session;
    private static Intent projection;
    private static boolean running;

    public static Session getSession() {
        return session;
    }

    public static void setSession(Session s) {
        session = s;
    }

    public static void setProjection(Intent p) {
        projection = p;
    }

    public static boolean isRunning() {
        return running;
    }

    public static boolean stopSession(Context ctx) {
        return ctx.stopService(new Intent(ctx, SessionService.class));
    }

    private TextView banner;
    private Realtime rt;
    private ScreenShare share;

    @Override
    public IBinder onBind(Intent i) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        final Session s = session;
        if (s == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;

        NotificationManager nm = (NotificationManager) getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel("session", "Help session", NotificationManager.IMPORTANCE_LOW));
        }
        Notification notification = (Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, "session")
                : new Notification.Builder(this))
                .setContentTitle("BM Support is helping on this TV")
                .setSmallIcon(android.R.drawable.ic_menu_view)
                .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(1, notification, projection != null ? 32 : 0); // FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
        } else {
            startForeground(1, notification);
        }

        showBanner();

        rt = new Realtime(s.topic, this::onEvent);
        rt.connect();
        rt.send("state", new JSONObject().put("consent", "allowed"));
        sendControl();
        FireSetup.INSTANCE.repairIfNeeded(this, this::sendControl);

        // Re-send the control state whenever it changes (staff panel stays accurate).
        new Thread(() -> {
            String last = "";
            while (running) {
                try {
                    Thread.sleep(4000L);
                } catch (InterruptedException e) {
                    break;
                }
                String now;
                try {
                    now = Control.INSTANCE.state(this, false).toString();
                } catch (Throwable t) {
                    continue;
                }
                if (!last.isEmpty() && !last.equals(now)) sendControl();
                last = now;
            }
        }).start();

        final Intent proj = projection;
        if (proj != null) {
            new Thread(() -> {
                try {
                    JSONObject res = Api.INSTANCE.session("ice", s);
                    JSONArray ice = res.optJSONArray("iceServers");
                    if (ice == null) ice = new JSONArray();
                    share = new ScreenShare(this, rt, proj, ice);
                    share.start();
                } catch (Throwable t) {
                    Diag.INSTANCE.send("screen_share_error", t.getClass().getSimpleName() + ": " + t.getMessage());
                }
            }).start();
        }

        // Watch the session status: when staff end it or it times out, shut down here too.
        new Thread(() -> {
            while (running) {
                try {
                    Thread.sleep(15000L);
                } catch (InterruptedException e) {
                    break;
                }
                String status;
                try {
                    status = Api.INSTANCE.session("status", s).optString("status");
                } catch (Throwable t) {
                    continue;
                }
                if ("ended".equals(status) || "expired".equals(status)) {
                    new Handler(getMainLooper()).post(this::stopSelf);
                    break;
                }
            }
        }).start();

        return START_NOT_STICKY;
    }

    private void onEvent(String event, JSONObject p) {
        if (p == null) p = new JSONObject();
        switch (event) {
            case "control_req":
                sendControl();
                break;
            case "answer": {
                ScreenShare ss = share;
                if (ss != null) ss.answer(p.optString("sdp"));
                break;
            }
            case "launch": {
                String pkg = p.optString("pkg");
                if (pkg != null && pkg.matches("[A-Za-z0-9_.]{1,150}")) Control.INSTANCE.send(this, "launch", pkg);
                break;
            }
            case "clear_text":
                Control.INSTANCE.send(this, "clear", null);
                break;
            case "cmd": {
                String key = p.optString("key");
                if (KEYS.contains(key)) Control.INSTANCE.send(this, "key", key);
                break;
            }
            case "end":
                stopSelf();
                break;
            case "ice": {
                ScreenShare ss = share;
                JSONObject candidate = p.optJSONObject("candidate");
                if (ss != null && candidate != null) ss.ice(candidate);
                break;
            }
            case "text": {
                String text = p.optString("text");
                Control.INSTANCE.send(this, "text", text.length() > 200 ? text.substring(0, 200) : text);
                break;
            }
            case "hello": {
                if (rt != null) rt.send("state", new JSONObject().put("consent", "allowed"));
                sendControl();
                ScreenShare ss = share;
                if (ss != null) ss.offer();
                break;
            }
            default:
                break;
        }
    }

    private void sendControl() {
        new Thread(() -> {
            final JSONObject state;
            try {
                state = Control.INSTANCE.state(this, false);
            } catch (Throwable t) {
                return;
            }
            new Handler(getMainLooper()).post(() -> {
                if (rt != null) rt.send("control", state);
            });
        }).start();
    }

    private void showBanner() {
        if (!Settings.canDrawOverlays(this)) return;
        WindowManager wm = (WindowManager) getSystemService(WindowManager.class);
        TextView view = new TextView(this);
        view.setText("  BM Support is controlling this TV — open BM Remote Helper to end  ");
        view.setBackgroundColor(0xCC0B1B26);
        view.setTextColor(0xFFFFFFFF);
        view.setTextSize(16.0f);
        view.setPadding(16, 8, 16, 8);
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                PixelFormat.TRANSLUCENT);
        lp.gravity = android.view.Gravity.TOP | android.view.Gravity.CENTER_HORIZONTAL;
        lp.y = 24;
        try {
            wm.addView(view, lp);
            banner = view;
        } catch (Throwable ignore) {
        }
    }

    @Override
    public void onDestroy() {
        running = false;
        if (rt != null) rt.send("end", new JSONObject());
        if (share != null) share.stop();
        if (rt != null) rt.close();
        if (banner != null) {
            try {
                ((WindowManager) getSystemService(WindowManager.class)).removeView(banner);
            } catch (Throwable ignore) {
            }
            banner = null;
        }
        final Session s = session;
        if (s != null) {
            new Thread(() -> {
                try {
                    Api.INSTANCE.session("end", s);
                } catch (Throwable ignore) {
                }
            }).start();
        }
        session = null;
        projection = null;
        super.onDestroy();
    }
}
