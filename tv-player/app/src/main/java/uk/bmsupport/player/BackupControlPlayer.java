package uk.bmsupport.player;

import android.os.Looper;
import androidx.media3.common.*;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.Collections;

/** Control-only Media3 adapter. Video remains attached to the existing VLC surface. */
final class BackupControlPlayer extends SimpleBasePlayer {
    interface Engine {
        long position(); long duration(); boolean ready(); boolean paused();
        void play(boolean play); void seek(long position); float speed(); void speed(float speed);
        Tracks tracks(); void tracks(TrackSelectionParameters parameters);
        /** Catch up: skip buttons reopen the recording a minute later/earlier. */
        default void jump(int minutes) {}
    }
    private final Engine engine;
    private final String kind;
    private TrackSelectionParameters selection = TrackSelectionParameters.DEFAULT_WITHOUT_CONTEXT;
    BackupControlPlayer(Engine engine, String kind) { super(Looper.getMainLooper()); this.engine = engine; this.kind = kind; }
    void refresh() { invalidateState(); }
    @Override protected State getState() {
        boolean seekable = PlayerControls.canSkip(kind) && engine.duration() > 0;
        Player.Commands.Builder commands = new Player.Commands.Builder().addAll(
                Player.COMMAND_PLAY_PAUSE, Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
                Player.COMMAND_GET_TIMELINE, Player.COMMAND_GET_METADATA,
                Player.COMMAND_SET_SPEED_AND_PITCH, Player.COMMAND_GET_TRACKS,
                Player.COMMAND_SET_TRACK_SELECTION_PARAMETERS);
        boolean catchup = "catchup".equals(kind);
        if (catchup) commands.addAll(Player.COMMAND_SEEK_BACK, Player.COMMAND_SEEK_FORWARD);
        if (seekable) commands.addAll(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM, Player.COMMAND_SEEK_BACK, Player.COMMAND_SEEK_FORWARD);
        MediaItemData item = new MediaItemData.Builder("backup").setMediaItem(MediaItem.EMPTY)
                .setTracks(engine.tracks()).setIsSeekable(seekable)
                .setDurationUs(engine.duration() > 0 ? engine.duration() * 1000 : C.TIME_UNSET).build();
        return new State.Builder().setAvailableCommands(commands.build())
                .setPlayWhenReady(!engine.paused(), Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
                .setPlaybackState(engine.ready() ? Player.STATE_READY : Player.STATE_BUFFERING)
                .setPlaylist(Collections.singletonList(item)).setContentPositionMs(Math.max(0, engine.position()))
                .setSeekBackIncrementMs(catchup ? CatchupStart.JUMP_MIN * 60000L : 5000).setSeekForwardIncrementMs(catchup ? CatchupStart.JUMP_MIN * 60000L : 15000)
                .setPlaybackParameters(new PlaybackParameters(Math.max(0.1f, engine.speed())))
                .setTrackSelectionParameters(selection).build();
    }
    @Override protected ListenableFuture<?> handleSetPlayWhenReady(boolean play) { engine.play(play); return Futures.immediateVoidFuture(); }
    @Override protected ListenableFuture<?> handleSeek(int index, long position, int command) {
        if ("catchup".equals(kind) && (command == Player.COMMAND_SEEK_FORWARD || command == Player.COMMAND_SEEK_BACK)) {
            engine.jump(command == Player.COMMAND_SEEK_FORWARD ? CatchupStart.JUMP_MIN : -CatchupStart.JUMP_MIN);
            return Futures.immediateVoidFuture();
        }
        if (PlayerControls.canSkip(kind) && engine.duration() > 0) engine.seek(Math.max(0, Math.min(engine.duration(), position)));
        return Futures.immediateVoidFuture();
    }
    @Override protected ListenableFuture<?> handleSetPlaybackParameters(PlaybackParameters parameters) { engine.speed(parameters.speed); return Futures.immediateVoidFuture(); }
    @Override protected ListenableFuture<?> handleSetTrackSelectionParameters(TrackSelectionParameters parameters) {
        selection = parameters; engine.tracks(parameters); return Futures.immediateVoidFuture();
    }
}