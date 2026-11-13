package uk.bmsupport.player;

import android.app.Activity;
import android.app.Application;
import android.view.Display;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.Implements;
import org.robolectric.annotation.Implementation;
import org.robolectric.shadows.ShadowDisplay;
import org.robolectric.util.ReflectionHelpers;
import org.robolectric.util.ReflectionHelpers.ClassParameter;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, application = Application.class, shadows = FrameRateWindowTest.FiftyHzDisplay.class)
public class FrameRateWindowTest {
    @Implements(Display.class)
    public static class FiftyHzDisplay extends ShadowDisplay {
        private Display.Mode fifty() { return ReflectionHelpers.callConstructor(Display.Mode.class,
            ClassParameter.from(int.class, 1), ClassParameter.from(int.class, 1920),
            ClassParameter.from(int.class, 1080), ClassParameter.from(float.class, 50f)); }
        @Implementation protected Display.Mode getMode() { return fifty(); }
        @Implementation protected Display.Mode[] getSupportedModes() { return new Display.Mode[]{fifty()}; }
    }
    @Test public void newWindowsRetainMatchingModeWithoutReportingAnotherSwitch() {
        for (int n = 0; n < 2; n++) {
            try (var controller = Robolectric.buildActivity(Activity.class).setup()) {
                Activity activity = controller.get();
                Display.Mode mode = activity.getWindowManager().getDefaultDisplay().getMode();
                assertEquals(50f, mode.getRefreshRate(), 0.001f);
                assertEquals(0, activity.getWindow().getAttributes().preferredDisplayModeId);
                assertFalse(FrameRateMatch.wouldSwitch(activity, mode.getRefreshRate()));
                assertFalse(FrameRateMatch.apply(activity, mode.getRefreshRate()));
                assertEquals(mode.getModeId(), activity.getWindow().getAttributes().preferredDisplayModeId);
                assertFalse(FrameRateMatch.apply(activity, mode.getRefreshRate()));
            }
        }
    }
    @Test public void previewAndFullScreenEngineNeverRequestAContentRateSwitch() {
        try (var controller = Robolectric.buildActivity(Activity.class).setup()) {
            Activity activity = controller.get();
            androidx.media3.exoplayer.ExoPlayer player = PlayerActivity.build(activity);
            try {
                assertEquals(androidx.media3.common.C.VIDEO_CHANGE_FRAME_RATE_STRATEGY_OFF,
                        player.getVideoChangeFrameRateStrategy());
                FrameRateMatch.apply(activity, 50f);
                assertEquals(1, activity.getWindow().getAttributes().preferredDisplayModeId);
            } finally { player.release(); }
        }
    }

}