package uk.bmsupport.player;

import android.content.Context;
import org.robolectric.RuntimeEnvironment;
import java.io.File;
import java.nio.file.Files;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(manifest=Config.NONE, sdk=28)
public class DeviceLockTest {
    @Test public void unlinkErasesSavedAccountDataAndFiles() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        DeviceLock.init(context);
        context.getSharedPreferences("bmplayer", 0).edit().putString("favourites", "film").putString("recent", "episode")
                .putString("orders", "saved-order").putString("user", "viewer").putString("pass", "secret").commit();
        File cached = new File(context.getFilesDir(), "saved-order.json");
        Files.write(cached.toPath(), new byte[]{1});
        DeviceLock.revoke();
        assertTrue(DeviceLock.locked());
        assertTrue(context.getSharedPreferences("bmplayer", 0).getAll().isEmpty());
        assertFalse(cached.exists());
        DeviceLock.init(context); // Reinitialisation still reads the persisted marker.
        assertTrue(DeviceLock.locked());
    }
    @Test public void latePlaybackWritesAreWipedOnLockedEntry() {
        Context context = RuntimeEnvironment.getApplication(); DeviceLock.init(context); DeviceLock.revoke();
        context.getSharedPreferences("bmplayer", 0).edit().putLong("watch_position", 42).commit();
        DeviceLock.wipe(); assertTrue(context.getSharedPreferences("bmplayer", 0).getAll().isEmpty());
        assertTrue(DeviceLock.locked());
    }
}