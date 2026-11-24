package uk.bmsupport.player;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;

/** No account, menus or announcements; one button starts a fresh link with a new code. Back only leaves the app. */
public final class UnlinkedActivity extends Activity {
    @Override protected void attachBaseContext(android.content.Context context) { super.attachBaseContext(PhoneScale.wrap(context)); }
    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        DeviceLock.wipe();
        TextView message = new TextView(this);
        message.setText("This device has been unlinked");
        message.setTextAppearance(android.R.style.TextAppearance_Material_Headline);
        message.setGravity(Gravity.CENTER);
        android.widget.Button relink = new android.widget.Button(this);
        relink.setText("Link this device again");
        relink.setOnClickListener(v -> {
            DeviceLock.relink(); PlayerApplication.relinked();
            startActivity(new android.content.Intent(this, MainActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK | android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK));
            finish();
        });
        android.widget.LinearLayout box = new android.widget.LinearLayout(this);
        box.setOrientation(android.widget.LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.addView(message);
        android.widget.LinearLayout.LayoutParams lp = new android.widget.LinearLayout.LayoutParams(-2, -2);
        lp.topMargin = 48;
        box.addView(relink, lp);
        setContentView(box);
        relink.requestFocus();
    }
}