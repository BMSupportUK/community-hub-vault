package uk.bmsupport.player;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;

/** Separate dialog activity so the warning also appears over built-in playback. */
public final class ConnectionWarningActivity extends Activity {
    @Override protected void attachBaseContext(android.content.Context b) { super.attachBaseContext(PhoneScale.wrap(b)); }
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        int active = getIntent().getIntExtra("active", 0), max = getIntent().getIntExtra("max", 0);
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Maximum connections exceeded")
                .setMessage("Your subscription allows " + max + " connections, but " + active
                        + " are active. The limit has been exceeded for at least 3 minutes.\n\n"
                        + "This has been reported to BM Support for investigation.")
                .setPositiveButton("Close", (d, w) -> finish())
                .setCancelable(false).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).requestFocus());
        dialog.show();
    }
}