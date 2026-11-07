package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class ChannelHealthStartTest {
    @Test public void beforeEventStartsIsNotStarted() { assertTrue(ChannelHealth.beforeStart(10_000L, 9_999L)); }
    @Test public void afterEventStartsIsNotWorking() { assertFalse(ChannelHealth.beforeStart(10_000L, 10_000L)); }
    @Test public void noStartTimeIsNotWorking() { assertFalse(ChannelHealth.beforeStart(0L, 5L)); }
}
