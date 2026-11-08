package uk.bmsupport.player;

import android.os.SystemClock;
import android.view.*;
import android.widget.*;
import androidx.media3.ui.PlayerControlView;
import java.lang.reflect.Field;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=34, application=PlayerApplication.class)
public class BackupControlsInteractionTest {
    void set(Object a,String key,Object v)throws Exception {Field f=a.getClass().getDeclaredField(key);f.setAccessible(true);f.set(a,v);}
    @Test public void idleBackupHidesBothControlLayers()throws Exception {
        BackupPlayerActivity a=Robolectric.buildActivity(BackupPlayerActivity.class).get();
        PlayerControlView bar=new PlayerControlView(a); bar.setAnimationEnabled(false); LinearLayout row=new LinearLayout(a);
        set(a,"controller",bar);set(a,"controlsRow",row);set(a,"lastPressAt",SystemClock.elapsedRealtime()-4500);
        Field f=BackupPlayerActivity.class.getDeclaredField("hideControls");f.setAccessible(true);((Runnable)f.get(a)).run();
        assertEquals(View.GONE,row.getVisibility());assertFalse(bar.isVisible());
    }
    @Test public void actionButtonActivatesItsActionNotPause() {
        BackupPlayerActivity a=Robolectric.buildActivity(BackupPlayerActivity.class).get(); FrameLayout root=new FrameLayout(a);
        int[] clicks={0}; LinearLayout row=PlayerActionControls.add(a,root,()->{},()->clicks[0]++,()->{});
        row.getChildAt(1).performClick();assertEquals(1,clicks[0]);
    }
    @Test public void soundButtonChangesSavedGain() {
        BackupPlayerActivity a=Robolectric.buildActivity(BackupPlayerActivity.class).get();FrameLayout root=new FrameLayout(a);
        SoundBoost.set(a,"off");int[] gain={0};
        LinearLayout row=PlayerActionControls.add(a,root,()->gain[0]=SoundBoost.gainFor(SoundBoost.current(a)),()->{},()->{});
        row.getChildAt(0).performClick();assertEquals(600,gain[0]);
    }
    @Test public void originalPlaybackBarPausesAndResumesBackup() {
        BackupPlayerActivity a=Robolectric.buildActivity(BackupPlayerActivity.class).get();
        BackupControlPlayerTest.Fake engine=new BackupControlPlayerTest.Fake();
        BackupControlPlayer player=new BackupControlPlayer(engine,"film");
        PlayerControlView bar=new PlayerControlView(a);bar.setPlayer(player);bar.show();
        View play=bar.findViewById(androidx.media3.ui.R.id.exo_play_pause);
        play.performClick();assertTrue(engine.paused);
        play.performClick();assertFalse(engine.paused);
        bar.setPlayer(null);player.release();
    }
}