package uk.bmsupport.player;

import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

/** Keep phone guide touches away from Android's Back/Home gesture edges. */
final class GuideSafeArea {
    private GuideSafeArea() {}

    static void apply(View screen) {
        final int left = screen.getPaddingLeft(), top = screen.getPaddingTop();
        final int right = screen.getPaddingRight(), bottom = screen.getPaddingBottom();
        ViewCompat.setOnApplyWindowInsetsListener(screen, (view, windowInsets) -> {
            Insets safe = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                    | WindowInsetsCompat.Type.systemGestures() | WindowInsetsCompat.Type.mandatorySystemGestures());
            view.setPadding(left + safe.left, top + safe.top, right + safe.right, bottom + safe.bottom);
            // Leave the insets available to children and leave Android navigation enabled.
            return windowInsets;
        });
        screen.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener() {
            @Override public void onViewAttachedToWindow(View view) { ViewCompat.requestApplyInsets(view); }
            @Override public void onViewDetachedFromWindow(View view) {}
        });
        ViewCompat.requestApplyInsets(screen);
    }
}