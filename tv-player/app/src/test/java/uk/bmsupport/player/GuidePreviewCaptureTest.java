package uk.bmsupport.player;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.view.View;
import java.io.File;
import java.io.FileOutputStream;
import java.util.Arrays;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

/** Temporary native-canvas capture, not a layout assertion. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "sw720dp-w1280dp-h720dp-land-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class GuidePreviewCaptureTest {
    @Test public void captureAndroidGuide() throws Exception {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        GuideGridView grid = new GuideGridView(activity);
        grid.setChannels(Arrays.asList("Sky Sports Main Event", "Sky Sport NZ", "DAZN Canada 01", "TNT Sports 1"), Arrays.asList(false, false, false, false));
        long now = System.currentTimeMillis() / 1000;
        long start = now / 900 * 900;
        for (int i = 0; i < 4; i++) {
            grid.setProgs(i, Arrays.asList(
                new GuideGridView.Prog(i == 1 ? "International Rugby Championship — South Africa versus New Zealand live coverage" : i == 2 ? "No Event Scheduled" : "Live football — Middlesbrough versus Coventry City", start - 900, start + 1800),
                new GuideGridView.Prog(i == 2 ? "Boxing — Main card live coverage" : "Sports highlights and post-match analysis", start + 1800, start + 5400)));
        }
        activity.setContentView(grid);
        grid.measure(View.MeasureSpec.makeMeasureSpec(1280, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(340, View.MeasureSpec.EXACTLY));
        grid.layout(0, 0, 1280, 340);
        grid.requestFocus();
        grid.setListener(new GuideGridView.Listener() {
            public void needEpg(int row) {}
            public void onHighlight(int row, GuideGridView.Prog p) {}
            public void onPick(int row, GuideGridView.Prog p) {}
            public boolean hasReminder(int row, long st) { return false; }
            public void onCatchup(int row) {}
        });
        Bitmap bitmap = Bitmap.createBitmap(1280, 340, Bitmap.Config.ARGB_8888);
        grid.draw(new Canvas(bitmap));
        File file = new File("/tmp/browser/android-epg/native-guide.png");
        file.getParentFile().mkdirs();
        try (FileOutputStream out = new FileOutputStream(file)) { bitmap.compress(Bitmap.CompressFormat.PNG, 100, out); }
    }
}