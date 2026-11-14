package uk.bmsupport.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class VlcHandoffTest {
    static final class Stream implements AutoCloseable {
        int closes;
        @Override public void close() { closes++; }
    }
    @Test public void sameStreamSurvivesFullScreenAndReturnWithoutRelease() {
        VlcHandoff<Stream> forward = new VlcHandoff<>(), backward = new VlcHandoff<>();
        Stream stream = new Stream();
        forward.offer(stream, "101", 1000);
        Stream fullScreen = forward.take("101", 1001);
        assertSame(stream, fullScreen);
        forward.drop(); assertEquals(0, stream.closes);
        backward.offer(fullScreen, "101", 2000);
        assertSame(stream, backward.take("101", 2001));
        backward.drop(); assertEquals(0, stream.closes);
    }
    @Test public void wrongChannelAndExpiredOffersReleaseOnlyTheirOwnStream() {
        VlcHandoff<Stream> slot = new VlcHandoff<>();
        Stream wrong = new Stream(); slot.offer(wrong, "101", 1000);
        assertNull(slot.take("202", 1001)); assertEquals(1, wrong.closes);
        Stream expired = new Stream(); slot.offer(expired, "101", 1000);
        assertNull(slot.take("101", 1001 + VlcHandoff.MAX_AGE_MS)); assertEquals(1, expired.closes);
        slot.drop(); assertEquals(1, expired.closes);
    }
}