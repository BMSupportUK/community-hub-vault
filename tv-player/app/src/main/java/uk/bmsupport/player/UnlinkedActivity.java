package uk.bmsupport.player;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;

/** No account, menus, announcements or route back to linking. Back only leaves the app. */
public final class UnlinkedActivity extends Activity {
    @Override protected void attachBaseContext(android.content.Context context) { super.attachBaseContext(PhoneScale.wrap(context)); }
    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        DeviceLock.wipe();
        TextView message = new TextView(this);
        message.setText("This device has been unlinked");
        message.setTextAppearance(android.R.style.TextAppearance_Material_Headline);
        message.setGravity(Gravity.CENTER);
        setContentView(message);
    }
}