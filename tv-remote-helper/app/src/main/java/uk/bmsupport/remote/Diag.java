package uk.bmsupport.remote;

import android.os.Build;
import org.json.JSONObject;

/** Sends setup progress to the website so we can see which remote-control step fails. No personal data. */
public final class Diag {
    public static final Diag INSTANCE = new Diag();

    private Diag() {}

    public void send(final String step, final String message) {
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject()
                        .put("action", "diag")
                        .put("helper", BuildConfig.VERSION_NAME)
                        .put("device", Build.MANUFACTURER + " " + Build.MODEL + " (Android " + Build.VERSION.RELEASE + ")")
                        .put("step", step);
                if (message != null) body.put("message", message.length() > 1450 ? message.substring(0, 1450) : message);
                Api.INSTANCE.post(body);
            } catch (Throwable ignore) {
                // Diagnostics must never break the app.
            }
        }).start();
    }
}
