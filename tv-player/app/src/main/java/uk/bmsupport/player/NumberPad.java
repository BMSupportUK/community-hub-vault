package uk.bmsupport.player;

import android.content.Context;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;

/**
 * In-app 0-9 keypad for number-only boxes. The phone's own keyboard is never opened for these boxes,
 * so it can never cover them (sideways phones leave almost no room above a system keyboard).
 * D-pad and touch press the keys; remote/hardware number keys type straight in.
 */
final class NumberPad {
    private NumberPad() {}

    /** Stops the system keyboard opening for the box and makes it display-only. */
    static void detachSystemKeyboard(EditText field) {
        field.setShowSoftInputOnFocus(false);
        field.setFocusable(false);
        field.setFocusableInTouchMode(false);
        field.setCursorVisible(false);
        field.setLongClickable(false);
        field.setTextIsSelectable(false);
    }

    /** Applies one key ("0"-"9", "del") to the box, respecting its max length. Returns the new text. */
    static String press(EditText field, String key, int max) {
        String t = field.getText().toString();
        if ("del".equals(key)) t = t.isEmpty() ? t : t.substring(0, t.length() - 1);
        else if (key.length() == 1 && Character.isDigit(key.charAt(0)) && t.length() < max) t = t + key;
        field.setText(t);
        return t;
    }

    /** Hardware/remote key -> pad key, or null. */
    static String keyFor(int keyCode) {
        if (keyCode >= KeyEvent.KEYCODE_0 && keyCode <= KeyEvent.KEYCODE_9) return String.valueOf(keyCode - KeyEvent.KEYCODE_0);
        if (keyCode >= KeyEvent.KEYCODE_NUMPAD_0 && keyCode <= KeyEvent.KEYCODE_NUMPAD_9) return String.valueOf(keyCode - KeyEvent.KEYCODE_NUMPAD_0);
        if (keyCode == KeyEvent.KEYCODE_DEL || keyCode == KeyEvent.KEYCODE_FORWARD_DEL) return "del";
        return null;
    }

    /**
     * Builds the 4-row pad (1-9, delete, 0, OK). onDone runs for OK and for the remote's Enter on
     * a full box is left to the OK key itself.
     */
    static LinearLayout build(Context c, EditText field, int max, int card, int accent, int text, Runnable onDone) {
        float d = c.getResources().getDisplayMetrics().density;
        detachSystemKeyboard(field);
        LinearLayout pad = new LinearLayout(c);
        pad.setOrientation(LinearLayout.VERTICAL);
        String[][] rows = {{"1", "2", "3"}, {"4", "5", "6"}, {"7", "8", "9"}, {"del", "0", "ok"}};
        View.OnKeyListener hw = (v, code, ev) -> {
            String k = keyFor(code);
            if (k == null || ev.getAction() != KeyEvent.ACTION_DOWN) return k != null;
            press(field, k, max);
            return true;
        };
        Button first = null;
        for (String[] r : rows) {
            LinearLayout row = new LinearLayout(c);
            row.setOrientation(LinearLayout.HORIZONTAL);
            for (String k : r) {
                Button b = new Button(c);
                b.setText("del".equals(k) ? "⌫" : "ok".equals(k) ? "OK" : k);
                b.setAllCaps(false); b.setTextColor(text); b.setTextSize(22); b.setTypeface(Typeface.DEFAULT_BOLD);
                b.setGravity(Gravity.CENTER); b.setPadding(0, 0, 0, 0);
                b.setFocusable(true); b.setFocusableInTouchMode(false);
                b.setBackground(bg(d, "ok".equals(k) ? accent : card, accent, text));
                b.setContentDescription("del".equals(k) ? "Delete" : "ok".equals(k) ? "OK" : k);
                b.setOnClickListener(v -> { if ("ok".equals(k)) { if (onDone != null) onDone.run(); } else press(field, k, max); });
                b.setOnKeyListener(hw);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, Math.round(42 * d), 1f);
                int m = Math.round(3 * d); lp.setMargins(m, m, m, m);
                row.addView(b, lp);
                if (first == null) first = b;
            }
            pad.addView(row, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        }
        if (first != null) pad.setTag(first);
        return pad;
    }

    /** First key, so a screen can put D-pad focus on the pad. */
    static View firstKey(LinearLayout pad) { return (View) pad.getTag(); }

    private static StateListDrawable bg(float d, int fill, int ring, int focusRing) {
        GradientDrawable on = new GradientDrawable(); on.setColor(fill); on.setCornerRadius(10 * d); on.setStroke(Math.round(3 * d), fill == ring ? focusRing : ring);
        GradientDrawable off = new GradientDrawable(); off.setColor(fill); off.setCornerRadius(10 * d);
        StateListDrawable s = new StateListDrawable();
        s.addState(new int[]{android.R.attr.state_focused}, on);
        s.addState(new int[]{android.R.attr.state_pressed}, on);
        s.addState(new int[]{}, off);
        return s;
    }
}
