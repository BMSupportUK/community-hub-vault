package uk.bmsupport.remote.control;

import android.accessibilityservice.AccessibilityService;
import android.media.AudioManager;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.content.Intent;
import android.content.pm.PackageManager;

/** Accessibility service that presses remote buttons on the TV during an allowed help session. */
public final class ControlService extends AccessibilityService {
    private static volatile ControlService instance;

    public static ControlService getInstance() {
        return instance;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {}

    @Override
    public void onInterrupt() {}

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override
    public boolean onUnbind(Intent intent) {
        instance = null;
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        instance = null;
        super.onDestroy();
    }

    private AccessibilityNodeInfo root() {
        try {
            return getRootInActiveWindow();
        } catch (Throwable t) {
            return null;
        }
    }

    private AccessibilityNodeInfo focused() {
        AccessibilityNodeInfo root = root();
        if (root != null) {
            AccessibilityNodeInfo f = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
            if (f != null) return f;
        }
        AccessibilityNodeInfo root2 = root();
        return root2 == null ? null : root2.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY);
    }

    private void move(int direction) {
        AccessibilityNodeInfo target = null;
        AccessibilityNodeInfo f = focused();
        if (f != null) target = f.focusSearch(direction);
        if (target == null) target = firstFocusable(root(), 0);
        if (target != null) {
            target.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
            target.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS);
        }
    }

    private AccessibilityNodeInfo firstFocusable(AccessibilityNodeInfo n, int depth) {
        if (n == null || depth > 40) return null;
        if (n.isFocusable() && n.isVisibleToUser()) return n;
        for (int i = 0; i < n.getChildCount(); i++) {
            AccessibilityNodeInfo found = firstFocusable(n.getChild(i), depth + 1);
            if (found != null) return found;
        }
        return null;
    }

    private boolean click(AccessibilityNodeInfo n) {
        while (n != null) {
            if (n.isClickable() && n.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
            n = n.getParent();
        }
        return false;
    }

    private void media(int code) {
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        long now = SystemClock.uptimeMillis();
        am.dispatchMediaKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0));
        am.dispatchMediaKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_UP, code, 0));
    }

    private void dpad(int globalAction, Runnable fallback) {
        if (android.os.Build.VERSION.SDK_INT < 33 || !performGlobalAction(globalAction)) {
            fallback.run();
        }
    }

    public void key(String k) {
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        switch (k) {
            case "volume_up":
                am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI);
                break;
            case "volume_down":
                am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI);
                break;
            case "ok":
                dpad(20, () -> click(focused())); // GLOBAL_ACTION_DPAD_CENTER
                break;
            case "up":
                dpad(16, () -> move(33)); // GLOBAL_ACTION_DPAD_UP / View.FOCUS_UP
                break;
            case "down":
                dpad(17, () -> move(130)); // GLOBAL_ACTION_DPAD_DOWN / View.FOCUS_DOWN
                break;
            case "left":
                dpad(18, () -> move(17)); // GLOBAL_ACTION_DPAD_LEFT / View.FOCUS_LEFT
                break;
            case "right":
                dpad(19, () -> move(66)); // GLOBAL_ACTION_DPAD_RIGHT / View.FOCUS_RIGHT
                break;
            case "back":
                performGlobalAction(GLOBAL_ACTION_BACK);
                break;
            case "home":
                performGlobalAction(GLOBAL_ACTION_HOME);
                break;
            case "play_pause":
                media(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE);
                break;
            default:
                break;
        }
    }

    private AccessibilityNodeInfo editable() {
        AccessibilityNodeInfo root = root();
        if (root == null) return null;
        AccessibilityNodeInfo f = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        return f != null && f.isEditable() ? f : null;
    }

    public void type(String text) {
        AccessibilityNodeInfo e = editable();
        if (e == null) return;
        String current = "";
        if (!e.isShowingHintText() && e.getText() != null) current = e.getText().toString();
        Bundle args = new Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, current + text);
        e.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
    }

    public void clearText() {
        AccessibilityNodeInfo e = editable();
        if (e == null) return;
        Bundle args = new Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "");
        e.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
    }

    public void launch(String pkg) {
        PackageManager pm = getPackageManager();
        Intent intent = pm.getLeanbackLaunchIntentForPackage(pkg);
        if (intent == null) intent = pm.getLaunchIntentForPackage(pkg);
        if (intent == null) return;
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
    }
}
