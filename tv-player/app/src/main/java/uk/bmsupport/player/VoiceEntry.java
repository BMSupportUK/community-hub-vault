package uk.bmsupport.player;

import android.app.Dialog;
import android.content.Context;
import android.text.InputType;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;

/** Fire TV dictation belongs to the keyboard, never an Alexa speech activity. */
final class VoiceEntry {
    /** Voice search shows everywhere; on Fire TV it opens the on-screen keyboard, whose own mic key dictates into the box. */
    static boolean available(String manufacturer) { return true; }
    static String hint(String manufacturer) {
        return "amazon".equalsIgnoreCase(manufacturer)
                ? "When the keyboard is showing, hold the microphone button on your remote and speak — your words type into the box."
                : "Say what you're looking for";
    }

    static boolean useSpeechActivity(String manufacturer, boolean resolved) {
        return resolved && !"amazon".equalsIgnoreCase(manufacturer);
    }

    static void openKeyboard(Dialog dialog, EditText field) {
        if (!dialog.isShowing()) return;
        Window window = dialog.getWindow();
        if (window == null) return;
        window.clearFlags(WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM
                | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE);
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN
                | WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        field.setInputType(InputType.TYPE_CLASS_TEXT);
        field.setFocusable(true);
        field.setFocusableInTouchMode(true);
        field.requestFocus();
        InputMethodManager keyboard = (InputMethodManager) field.getContext()
                .getSystemService(Context.INPUT_METHOD_SERVICE);
        if (keyboard != null) keyboard.showSoftInput(field, InputMethodManager.SHOW_FORCED);
    }
}