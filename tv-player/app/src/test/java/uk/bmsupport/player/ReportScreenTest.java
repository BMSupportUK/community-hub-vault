package uk.bmsupport.player;

import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.LinearLayout;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.robolectric.RuntimeEnvironment.getApplication;

/** The player screen's Report a problem pop-up must stay usable on a sideways phone. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class, qualifiers = "w960dp-h540dp-xhdpi")
public class ReportScreenTest {

    private PlayerActivity.ReportBox box() {
        return PlayerActivity.buildReportBox(getApplication(), "Test Channel", "live", "Sports");
    }

    @Test public void sendAndCancelSitAboveTheTypingBox() {
        PlayerActivity.ReportBox rb = box();
        LinearLayout actions = (LinearLayout) rb.send.getParent();
        assertTrue("Send must live in the actions row", actions.indexOfChild(rb.send) >= 0);
        assertTrue("Cancel must live in the actions row", actions.indexOfChild(rb.cancel) >= 0);
        assertTrue("Send/Cancel must sit above the typing box so the keypad cannot cover them",
                rb.box.indexOfChild(actions) < rb.box.indexOfChild(rb.issue));
    }

    @Test public void typingBoxStaysSmallAndTheKeypadSendKeySends() {
        PlayerActivity.ReportBox rb = box();
        assertTrue("The typing box must not grow past three lines", rb.issue.getMaxLines() <= 3);
        assertEquals("The keypad's own Send key must send the report",
                EditorInfo.IME_ACTION_SEND, rb.issue.getImeOptions() & EditorInfo.IME_MASK_ACTION);
        assertTrue("The keypad must stay in place instead of taking the screen",
                (rb.issue.getImeOptions() & EditorInfo.IME_FLAG_NO_EXTRACT_UI) != 0);
    }

    @Test public void popUpPansAboveTheKeypadInsteadOfResizing() {
        int mode = PlayerActivity.reportInputMode();
        assertEquals("The pop-up must pan, never resize (resizing made phones flicker)",
                WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN,
                mode & WindowManager.LayoutParams.SOFT_INPUT_MASK_ADJUST);
    }
}
