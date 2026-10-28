package uk.bmsupport.remote.control;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;

/** Receives commands from BM Remote Helper (signature-protected) and runs them on the service. */
public final class CommandReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        final ControlService service = ControlService.getInstance();
        if (service == null) return;
        final String type = intent.getStringExtra("type");
        final String value = intent.getStringExtra("value");
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                if (type == null) return;
                switch (type) {
                    case "key":
                        if (value != null) service.key(value);
                        break;
                    case "text":
                        if (value != null) service.type(value.length() > 200 ? value.substring(0, 200) : value);
                        break;
                    case "clear":
                        service.clearText();
                        break;
                    case "launch":
                        if (value != null) service.launch(value);
                        break;
                    default:
                        break;
                }
            } catch (Throwable ignore) {
            }
        });
    }
}
