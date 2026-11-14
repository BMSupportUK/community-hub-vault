package uk.bmsupport.player;

import android.app.Activity;
import android.app.AlertDialog;
import android.view.WindowManager;
import android.widget.EditText;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = android.app.Application.class)
public class VoiceEntryTest {
    @Test public void amazonNeverLaunchesResolvedGlobalSpeechActivity() {
        assertFalse(VoiceEntry.useSpeechActivity("Amazon", true));
        assertTrue(VoiceEntry.useSpeechActivity("Google", true));
        assertFalse(VoiceEntry.useSpeechActivity("Google", false));
    }

    @Test public void voiceSearchShowsOnAmazonWithKeyboardMicHint() {
        assertTrue(VoiceEntry.available("Amazon"));
        assertTrue(VoiceEntry.hint("Amazon").contains("on-screen keyboard"));
        assertTrue(VoiceEntry.available("Google"));
        assertTrue(VoiceEntry.available("Xiaomi"));
    }

    @Test public void shownSearchDialogFocusesAttachedEditorAndAllowsKeyboard() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().visible().get();
        EditText field = new EditText(activity);
        AlertDialog dialog = new AlertDialog.Builder(activity).setView(field)
                .setPositiveButton("Search", null).create();
        dialog.show();
        org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();
        dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM);
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).requestFocus();
        VoiceEntry.openKeyboard(dialog, field);
        assertTrue(field.isAttachedToWindow());
        assertTrue(field.hasFocus());
        assertEquals(0, dialog.getWindow().getAttributes().flags
                & WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM);
        dialog.dismiss();
        VoiceEntry.openKeyboard(dialog, field);
        assertFalse(dialog.isShowing());
    }
}