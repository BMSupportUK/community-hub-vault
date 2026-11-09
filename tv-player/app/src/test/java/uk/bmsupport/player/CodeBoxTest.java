package uk.bmsupport.player;

import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** The customer must be able to read back the code they are typing on the keypad. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class, qualifiers = "w960dp-h540dp-xhdpi")
public class CodeBoxTest {

    private TextView cell(LinearLayout box, int i) { return (TextView) box.getChildAt(i); }

    @Test public void typedDigitsAppearInTheBoxAndEmptyCellsStayBlank() {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).get();
        EditText in = new EditText(a);
        LinearLayout box = CodeBox.build(a, in, 6, 0xFF16213A, 0xFFE11D48, 0xFFF1F5F9, 0xFF94A3B8);
        assertEquals("one cell per digit", 6, box.getChildCount());
        assertEquals("–", cell(box, 0).getText().toString());

        NumberPad.press(in, "4", 6);
        NumberPad.press(in, "8", 6);
        NumberPad.press(in, "2", 6);

        assertEquals("4", cell(box, 0).getText().toString());
        assertEquals("8", cell(box, 1).getText().toString());
        assertEquals("2", cell(box, 2).getText().toString());
        assertEquals("–", cell(box, 3).getText().toString());
        assertEquals("–", cell(box, 5).getText().toString());
    }

    @Test public void deletingADigitClearsItsCell() {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).get();
        EditText in = new EditText(a);
        LinearLayout box = CodeBox.build(a, in, 6, 0xFF16213A, 0xFFE11D48, 0xFFF1F5F9, 0xFF94A3B8);
        NumberPad.press(in, "1", 6);
        NumberPad.press(in, "9", 6);
        NumberPad.press(in, "del", 6);
        assertEquals("1", cell(box, 0).getText().toString());
        assertEquals("–", cell(box, 1).getText().toString());
    }

    @Test public void aWrongCodeClearedByTheAppEmptiesTheBox() {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).get();
        EditText in = new EditText(a);
        LinearLayout box = CodeBox.build(a, in, 6, 0xFF16213A, 0xFFE11D48, 0xFFF1F5F9, 0xFF94A3B8);
        NumberPad.press(in, "7", 6);
        in.setText("");
        assertEquals("–", cell(box, 0).getText().toString());
    }

    @Test public void anEightDigitBackupCodeGetsEightCells() {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).get();
        EditText in = new EditText(a);
        LinearLayout box = CodeBox.build(a, in, 8, 0xFF16213A, 0xFFE11D48, 0xFFF1F5F9, 0xFF94A3B8);
        assertEquals(8, box.getChildCount());
        for (int i = 0; i < 8; i++) NumberPad.press(in, String.valueOf(i), 8);
        assertEquals("7", cell(box, 7).getText().toString());
    }
}
