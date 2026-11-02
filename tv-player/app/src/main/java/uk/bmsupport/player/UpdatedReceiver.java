package uk.bmsupport.player;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** After an in-app update, reopen BM Player instead of leaving the customer on the device home screen. */
public class UpdatedReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        if (!Intent.ACTION_MY_PACKAGE_REPLACED.equals(i.getAction())) return;
        try {
            c.startActivity(new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
        } catch (Exception ignored) {}
    }
}
