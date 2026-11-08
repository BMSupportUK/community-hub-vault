package uk.bmsupport.player;

import androidx.media3.common.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=34)
public class BackupControlPlayerTest {
    static final class Fake implements BackupControlPlayer.Engine {
        long position=20000; boolean paused; float speed=1; TrackSelectionParameters selected;
        public long position(){return position;} public long duration(){return 120000;}
        public boolean ready(){return true;} public boolean paused(){return paused;}
        public void play(boolean play){paused=!play;} public void seek(long p){position=p;}
        public float speed(){return speed;} public void speed(float s){speed=s;}
        public Tracks tracks(){return Tracks.EMPTY;} public void tracks(TrackSelectionParameters p){selected=p;}
    }
    @Test public void transportControlsChangeActualEngine() {
        Fake f=new Fake(); BackupControlPlayer p=new BackupControlPlayer(f,"film");
        p.pause(); assertTrue(f.paused); p.play(); assertFalse(f.paused);
        p.seekForward(); assertEquals(35000,f.position);
        p.seekBack(); assertEquals(30000,f.position);
        p.setPlaybackSpeed(1.5f); assertEquals(1.5f,f.speed,0.001f);
    }
    @Test public void liveHasNoSeekCommandsOrSeekSideEffects() {
        Fake f=new Fake(); BackupControlPlayer p=new BackupControlPlayer(f,"live");
        assertFalse(p.isCommandAvailable(Player.COMMAND_SEEK_FORWARD));
        p.seekTo(80000); assertEquals(20000,f.position);
    }
    @Test public void catchupHasNoSeekCommands() {
        BackupControlPlayer p=new BackupControlPlayer(new Fake(),"catchup");
        assertFalse(p.isCommandAvailable(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM));
    }
    @Test public void subtitleOffReachesEngine() {
        Fake f=new Fake(); BackupControlPlayer p=new BackupControlPlayer(f,"episode");
        p.setTrackSelectionParameters(p.getTrackSelectionParameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT,true).build());
        assertTrue(f.selected.disabledTrackTypes.contains(C.TRACK_TYPE_TEXT));
    }
}