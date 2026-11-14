package uk.bmsupport.player;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.SharedPreferences;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;

@RunWith(RobolectricTestRunner.class)
@org.robolectric.annotation.Config(sdk = 28)
public class CatchupLearnedStartTest {
    @Test public void channelOpensWhereTheCustomerLastSkippedTo() {
        SharedPreferences p = RuntimeEnvironment.getApplication().getSharedPreferences("learn-test", Context.MODE_PRIVATE);
        p.edit().clear().apply();
        assertEquals(CatchupStart.DEFAULT_MIN, CatchupStart.offsetFor(p, "77"));
        p.edit().putInt(CatchupStart.learnKey("77"), 6).apply();
        assertEquals(6, CatchupStart.offsetFor(p, "77"));
        assertEquals(CatchupStart.DEFAULT_MIN, CatchupStart.offsetFor(p, "78"));
    }
}
