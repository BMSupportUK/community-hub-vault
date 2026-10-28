package uk.bmsupport.remote;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Receives the result of installing the BM Remote Control app via PackageInstaller. */
public final class InstallReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm == null) return;
            confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                ctx.startActivity(confirm);
            } catch (Throwable ignore) {
            }
            return;
        }
        if (status == PackageInstaller.STATUS_SUCCESS) {
            Control.INSTANCE.setInstallMessage(null);
            return;
        }
        String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        Control.INSTANCE.setInstallMessage(msg == null ? "Install did not finish. Press Install again." : msg);
    }
}
