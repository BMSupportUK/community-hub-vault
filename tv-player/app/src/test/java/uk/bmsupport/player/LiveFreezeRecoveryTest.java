package uk.bmsupport.player;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class)
public class LiveFreezeRecoveryTest {
    @Test public void threeFreshDecodersThenBackupInsteadOfEndlessSeeking() {
        assertFalse(LiveFreezeRecovery.useBackup(0));
        assertFalse(LiveFreezeRecovery.useBackup(1));
        assertFalse(LiveFreezeRecovery.useBackup(2));
        assertTrue(LiveFreezeRecovery.useBackup(3));
        assertTrue(LiveFreezeRecovery.useBackup(10));
    }
    @Test public void recoveryKeepsExactFeedAndDropsCarriedDecoder() {
        android.content.Intent original = new android.content.Intent()
                .putExtra("content_id", "movie-premiere")
                .putExtra("content_name", "Movie Premiere ᴴᴰ")
                .putExtra("urls", new String[]{"https://example.invalid/feed.ts", "https://example.invalid/feed.m3u8"})
                .putExtra("carried", true).putExtra("freeze_restarts", 1);
        android.content.Intent retry = PlayerActivity.freshFreezeIntent(original, 0);
        assertFalse(retry.getBooleanExtra("carried", false));
        assertEquals(2, retry.getIntExtra("freeze_restarts", 0));
        assertEquals("movie-premiere", retry.getStringExtra("content_id"));
        assertArrayEquals(original.getStringArrayExtra("urls"), retry.getStringArrayExtra("urls"));
        assertEquals(0, retry.getIntExtra("freeze_url_index", -1));
    }
    @Test public void frozenStageReleasesPlayerAndStartsOpaqueSameFeedScreen() throws Exception {
        PlayerStageActivity activity = Robolectric.buildActivity(PlayerStageActivity.class).get();
        activity.setIntent(new android.content.Intent().putExtra("carried", true)
                .putExtra("content_kind", "live").putExtra("content_id", "premiere")
                .putExtra("urls", new String[]{"https://example.invalid/premiere.ts"}));
        java.lang.reflect.Field field = PlayerActivity.class.getDeclaredField("player");
        field.setAccessible(true);
        field.set(activity, new androidx.media3.exoplayer.ExoPlayer.Builder(activity).build());
        java.lang.reflect.Method recover = PlayerActivity.class.getDeclaredMethod("recoverFrozenLive");
        recover.setAccessible(true); recover.invoke(activity);
        assertNull(field.get(activity));
        android.content.Intent next = org.robolectric.Shadows.shadowOf(activity).getNextStartedActivity();
        assertNotNull(next);
        assertEquals(PlayerActivity.class.getName(), next.getComponent().getClassName());
        assertEquals("premiere", next.getStringExtra("content_id"));
        assertFalse(next.getBooleanExtra("carried", false));
        assertTrue(activity.isFinishing());
    }
}