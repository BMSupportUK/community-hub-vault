package uk.bmsupport.player;

import android.app.Activity;
import android.view.Display;
import android.os.Looper;
import java.time.Duration;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.Implements;
import org.robolectric.annotation.Implementation;
import org.robolectric.shadows.ShadowDisplay;
import org.robolectric.util.ReflectionHelpers;
import org.robolectric.util.ReflectionHelpers.ClassParameter;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, qualifiers = "television", application = PlayerApplication.class,
    shadows = IntroDisplayTest.TvDisplay.class)
public class IntroDisplayTest {
    public static class RootIntro extends IntroActivity {
        @Override public boolean isTaskRoot() { return true; }
    }
    @Implements(Display.class)
    public static class TvDisplay extends ShadowDisplay {
        private Display.Mode mode(int id, float hz) {
            return ReflectionHelpers.callConstructor(Display.Mode.class,
                ClassParameter.from(int.class, id), ClassParameter.from(int.class, 1920),
                ClassParameter.from(int.class, 1080), ClassParameter.from(float.class, hz));
        }
        @Implementation protected Display.Mode getMode() { return mode(1, 60f); }
        @Implementation protected Display.Mode[] getSupportedModes() {
            return new Display.Mode[]{mode(1, 60f), mode(2, 50f)};
        }
    }

    @Test public void linkOpensImmediatelyAfterTheAdvanceSwitchWarning() {
        try (var controller = Robolectric.buildActivity(RootIntro.class)) {
            controller.create();
            IntroActivity activity = controller.get();
            Shadows.shadowOf((android.app.UiModeManager) activity.getSystemService(Activity.UI_MODE_SERVICE))
                .setCurrentModeType(android.content.res.Configuration.UI_MODE_TYPE_TELEVISION);
            assertTrue(FrameRateMatch.isAndroidTv(activity));
            assertEquals(0, activity.getWindow().getAttributes().preferredDisplayModeId);
            ReflectionHelpers.callInstanceMethod(activity, "afterVideo");
            assertEquals(0, activity.getWindow().getAttributes().preferredDisplayModeId);
            assertNull(Shadows.shadowOf(activity).peekNextStartedActivity());
            Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(1499));
            assertEquals(0, activity.getWindow().getAttributes().preferredDisplayModeId);
            Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(1));
            assertEquals(2, activity.getWindow().getAttributes().preferredDisplayModeId);
            assertEquals(MainActivity.class.getName(), Shadows.shadowOf(activity).getNextStartedActivity().getComponent().getClassName());
            Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(2000));
            assertNull(Shadows.shadowOf(activity).getNextStartedActivity());
        }
    }
}