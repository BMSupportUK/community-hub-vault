package uk.bmsupport.player;

import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;
import static org.junit.Assert.*;

public class SportsChannelMatchTest {
    @Test public void boxingNumberIgnoresOldReplayAndOtherProgrammeNumbers() {
        MainActivity.Item one = new MainActivity.Item("live", "1", "Boxing 01 | Replay Buatsi vs. Hutchinson 2", "ts", "boxing");
        MainActivity.Item two = new MainActivity.Item("live", "2", "Boxing 02 | Old event replay", "ts", "boxing");
        MainActivity.Item twelve = new MainActivity.Item("live", "12", "Boxing 12 | Buatsi vs. Hutchinson 2 19:00", "ts", "boxing");
        assertEquals(Collections.singletonList(two), MainActivity.matchChannel("Boxing 02 | Buatsi vs. Hutchinson 2 19:00", Arrays.asList(one, two, twelve), Collections.emptyList()));
    }
    @Test public void bareMonoMaxCannotExpandToNumberedFeeds() {
        MainActivity.Item one = new MainActivity.Item("live", "1", "MonoMax 1 HD", "ts", "mono");
        MainActivity.Item two = new MainActivity.Item("live", "2", "MonoMax 2 HD", "ts", "mono");
        assertTrue(MainActivity.matchChannel("MonoMax", Arrays.asList(one, two), Collections.emptyList()).isEmpty());
    }

    @Test public void monoMaxOneCannotMatchTenOrTwo() {
        MainActivity.Item one = new MainActivity.Item("live", "1", "MonoMax 1 HD", "ts", "mono");
        MainActivity.Item ten = new MainActivity.Item("live", "10", "MonoMax 10 HD", "ts", "mono");
        assertEquals(Collections.singletonList(one), MainActivity.matchChannel("MonoMax 1", Arrays.asList(one, ten), Collections.emptyList()));
    }
}