package uk.bmsupport.player;

import android.app.Activity;
import android.view.View;
import android.widget.FrameLayout;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=34, application=android.app.Application.class)
public class VlcStageInteractionTest {
    @Test public void guideDrawerAndScrimStayAbovePreviewWithoutDetachingIt() {
        Activity activity=Robolectric.buildActivity(Activity.class).setup().get();
        FrameLayout guide=new FrameLayout(activity), content=new FrameLayout(activity);
        View anchor=new View(activity), scrim=new View(activity), drawer=new View(activity);
        content.addView(anchor); guide.addView(content); guide.addView(scrim); guide.addView(drawer);
        activity.setContentView(guide);
        View picture=new View(activity);
        VlcStage stage=new VlcStage(activity,anchor,picture);
        assertSame(guide,picture.getParent());
        assertTrue(guide.indexOfChild(picture)>guide.indexOfChild(content));
        assertTrue(guide.indexOfChild(scrim)>guide.indexOfChild(picture));
        assertTrue(guide.indexOfChild(drawer)>guide.indexOfChild(picture));
        stage.full(true); stage.full(false);
        assertSame(guide,picture.getParent());
        assertTrue(guide.indexOfChild(drawer)>guide.indexOfChild(picture));
        stage.close();
    }
    @Test public void expandingAndReturningNeverDetachesPicture() {
        Activity activity=Robolectric.buildActivity(Activity.class).setup().get();
        FrameLayout anchor=new FrameLayout(activity);
        activity.setContentView(anchor);
        View picture=new View(activity);
        VlcStage stage=new VlcStage(activity,anchor,picture);
        Object parent=picture.getParent();
        stage.full(true);
        assertSame(parent,picture.getParent());
        assertTrue(stage.full);
        stage.full(false);
        assertSame(parent,picture.getParent());
        assertFalse(stage.full);
        stage.close();
        assertNull(picture.getParent());
    }
}