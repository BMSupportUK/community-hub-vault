package uk.bmsupport.player;

import android.app.AlertDialog;
import android.view.Gravity;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** The on-screen keypad must never sit on top of what the owner is typing. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class, qualifiers = "w960dp-h540dp-xhdpi")
public class KeypadClearanceTest {

    private MainActivity open() throws Exception {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).get();
        Field prefs = MainActivity.class.getDeclaredField("prefs");
        prefs.setAccessible(true);
        prefs.set(a, a.getSharedPreferences("bmplayer", 0));
        return a;
    }

    private void keepVisible(MainActivity a, android.app.Dialog d, EditText e) throws Exception {
        Method m = MainActivity.class.getDeclaredMethod("keepEntryVisible", android.app.Dialog.class, EditText.class);
        m.setAccessible(true);
        m.invoke(a, d, e);
    }

    @Test public void entryBoxIsHeldAboveTheKeypad() throws Exception {
        MainActivity a = open();
        EditText e = new EditText(a);
        AlertDialog d = new AlertDialog.Builder(a).setView(e).create();
        keepVisible(a, d, e);
        WindowManager.LayoutParams lp = d.getWindow().getAttributes();
        assertEquals("the box must sit at the top of the screen, clear of the keypad", Gravity.TOP, lp.gravity);
        assertEquals("the pop-up must slide up until the box is above the keypad, never be cut off",
                WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN,
                lp.softInputMode & WindowManager.LayoutParams.SOFT_INPUT_MASK_ADJUST);
        assertTrue("the keypad must be open while the box is up",
                (lp.softInputMode & WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE) != 0);
    }

    @Test public void typingFlagsKeepTheBoxOutOfTheFullScreenExtractView() throws Exception {
        MainActivity a = open();
        EditText e = new EditText(a);
        e.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        AlertDialog d = new AlertDialog.Builder(a).setView(e).create();
        keepVisible(a, d, e);
        int opts = e.getImeOptions();
        assertTrue((opts & EditorInfo.IME_FLAG_NO_EXTRACT_UI) != 0);
        assertTrue((opts & EditorInfo.IME_FLAG_NO_FULLSCREEN) != 0);
        assertEquals("the box's own action must survive", EditorInfo.IME_ACTION_SEARCH,
                opts & EditorInfo.IME_MASK_ACTION);
    }

    @Test public void accountNumberScreenSitsAboveTheKeypad() throws Exception {
        MainActivity a = open();
        Method m = MainActivity.class.getDeclaredMethod("showUnlock");
        m.setAccessible(true);
        m.invoke(a);
        android.view.View content = a.getWindow().getDecorView().findViewById(android.R.id.content);

        ScrollView sc = (ScrollView) ((android.view.ViewGroup) content).getChildAt(0);
        LinearLayout root = (LinearLayout) sc.getChildAt(0);
        assertEquals("the account number must be held near the top, clear of the keypad",
                Gravity.TOP, root.getGravity() & Gravity.FILL_VERTICAL);
    }

    private static EditText findBox(android.view.View v) {
        if (v instanceof EditText) return (EditText) v;
        if (v instanceof android.view.ViewGroup) {
            android.view.ViewGroup g = (android.view.ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) { EditText e = findBox(g.getChildAt(i)); if (e != null) return e; }
        }
        return null;
    }

    @Test public void accountNumberScreenNeverOpensThePhoneKeyboard() throws Exception {
        MainActivity a = open();
        Method m = MainActivity.class.getDeclaredMethod("showUnlock");
        m.setAccessible(true);
        m.invoke(a);
        EditText box = findBox(a.getWindow().getDecorView());
        assertNotNull(box);
        assertFalse("the phone keyboard must never open for the account number", box.getShowSoftInputOnFocus());
        assertFalse("the box is display-only; BM's own pad types into it", box.isFocusable());
        assertEquals(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN,
                a.getWindow().getAttributes().softInputMode & WindowManager.LayoutParams.SOFT_INPUT_MASK_STATE);
    }

    @Test public void numberPadTypesDeletesAndStopsAtSixDigits() throws Exception {
        MainActivity a = open();
        EditText e = new EditText(a);
        for (String k : new String[]{"1", "2", "3", "4", "5", "6", "7"}) NumberPad.press(e, k, 6);
        assertEquals("123456", e.getText().toString());
        NumberPad.press(e, "del", 6);
        assertEquals("12345", e.getText().toString());
        assertEquals("7", NumberPad.keyFor(android.view.KeyEvent.KEYCODE_7));
        assertEquals("del", NumberPad.keyFor(android.view.KeyEvent.KEYCODE_DEL));
    }

    @Test public void edgeToEdgeScreensLiftByTheKeypadHeight() {
        assertEquals("a 700px keypad lifts the screen 700px", 700, MainActivity.keypadLift(700, 48));
        assertEquals("with the keypad closed only the nav bar is cleared", 48, MainActivity.keypadLift(0, 48));
        assertEquals(0, MainActivity.keypadLift(0, 0));
    }
}
