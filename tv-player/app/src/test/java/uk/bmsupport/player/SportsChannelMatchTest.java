package uk.bmsupport.player;

import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;
import static org.junit.Assert.*;

public class SportsChannelMatchTest {
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