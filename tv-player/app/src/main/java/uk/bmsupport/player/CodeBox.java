package uk.bmsupport.player;

import android.content.Context;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Visible box that shows the code the customer is typing on the keypad: one cell per digit, with the
 * next empty cell ringed so they can see how far they have got. The EditText stays the hidden buffer
 * the keypad writes into, so nothing about the keypad or the check changes.
 */
final class CodeBox {
    private CodeBox() {}

    static LinearLayout build(Context c, EditText field, int digits, int card, int accent, int text, int muted) {
        float d = c.getResources().getDisplayMetrics().density;
        final TextView[] cells = new TextView[digits];
        LinearLayout box = new LinearLayout(c);
        box.setOrientation(LinearLayout.HORIZONTAL);
        box.setGravity(Gravity.CENTER);
        for (int i = 0; i < digits; i++) {
            TextView cell = new TextView(c);
            cell.setGravity(Gravity.CENTER);
            cell.setTextSize(30);
            cell.setTypeface(Typeface.DEFAULT_BOLD);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(Math.round((digits > 6 ? 34 : 42) * d), Math.round(48 * d));
            int m = Math.round((digits > 6 ? 3 : 4) * d);
            lp.setMargins(m, 0, m, 0);
            cell.setLayoutParams(lp);
            box.addView(cell);
            cells[i] = cell;
        }
        paint(cells, field.getText().toString(), accent, muted, text, card, d);
        field.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            public void onTextChanged(CharSequence s, int a, int b, int c) {}
            public void afterTextChanged(Editable s) {
                paint(cells, s == null ? "" : s.toString(), accent, muted, text, card, d);
            }
        });
        box.setPadding(0, Math.round(4 * d), 0, Math.round(4 * d));
        return box;
    }

    /** Filled cells show their digit, empty cells a dash, and the cell still to be typed is ringed. */
    private static void paint(TextView[] cells, String value, int accent, int muted, int text, int card, float d) {
        String v = value == null ? "" : value;
        for (int i = 0; i < cells.length; i++) {
            TextView cell = cells[i];
            boolean filled = i < v.length();
            cell.setText(filled ? String.valueOf(v.charAt(i)) : "–");
            cell.setTextColor(filled ? text : muted);
            int ring = filled ? card : (i == v.length() ? accent : muted);
            cell.setBackground(bg(d, card, ring));
        }
    }

    private static GradientDrawable bg(float d, int fill, int ring) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setCornerRadius(8 * d);
        g.setStroke(Math.round(2 * d), ring);
        return g;
    }
}
