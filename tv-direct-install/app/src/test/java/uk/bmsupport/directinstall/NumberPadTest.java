package uk.bmsupport.directinstall;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import android.view.KeyEvent;
import org.junit.Test;

/** PIN and website-code screens use BM's own pad, so remote number keys must map straight in. */
public class NumberPadTest {
    @Test public void remoteNumberKeysAndDeleteMap() {
        assertEquals("0", NumberPad.keyFor(KeyEvent.KEYCODE_0));
        assertEquals("9", NumberPad.keyFor(KeyEvent.KEYCODE_NUMPAD_9));
        assertEquals("del", NumberPad.keyFor(KeyEvent.KEYCODE_DEL));
        assertNull(NumberPad.keyFor(KeyEvent.KEYCODE_DPAD_LEFT));
    }
}
