package uk.bmsupport.player;

import static org.junit.Assert.*;
import java.util.ArrayList;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class PrivateDnsTest {
    private PrivateDns.Fetcher saved;
    @Before public void setUp() { saved = PrivateDns.fetcher; PrivateDns.clear(); }
    @After public void tearDown() { PrivateDns.fetcher = saved; PrivateDns.clear(); }

    @Test public void cloudflareFirst() {
        List<String> asked = new ArrayList<>();
        PrivateDns.fetcher = (u, t) -> { asked.add(u); return "{\"Status\":0,\"Answer\":[{\"name\":\"a.com\",\"type\":1,\"data\":\"1.2.3.4\"}]}"; };
        assertEquals("1.2.3.4", PrivateDns.resolve("a.com"));
        assertEquals(1, asked.size());
        assertTrue(asked.get(0).startsWith("https://1.1.1.1/"));
    }

    @Test public void googleWhenCloudflareTimesOut() {
        List<String> asked = new ArrayList<>();
        PrivateDns.fetcher = (u, t) -> { asked.add(u); assertEquals(3000, t);
            if (u.contains("1.1.1.1")) throw new java.net.SocketTimeoutException();
            return "{\"Status\":0,\"Answer\":[{\"type\":1,\"data\":\"5.6.7.8\"}]}"; };
        assertEquals("5.6.7.8", PrivateDns.resolve("b.com"));
        assertTrue(asked.get(1).startsWith("https://8.8.8.8/"));
    }

    @Test public void bothFailFallsBackToNormalDns() {
        PrivateDns.fetcher = (u, t) -> { throw new java.net.SocketTimeoutException(); };
        assertNull(PrivateDns.resolve("c.com"));
    }

    @Test public void skipsLiteralIp() {
        PrivateDns.fetcher = (u, t) -> { fail("should not look up"); return null; };
        assertNull(PrivateDns.resolve("9.9.9.9"));
    }

    @Test public void clearingResetsTheListLookupFlag() {
        PrivateDns.listUsed = true;
        PrivateDns.clear();
        assertFalse(PrivateDns.listUsed);
    }

    @org.junit.Test
    public void homeLabelShowsVpnThenSwitchState() {
        org.junit.Assert.assertEquals("via VPN", PrivateDns.homeLabel(false, true));
        org.junit.Assert.assertEquals("Cloudflare", PrivateDns.homeLabel(true, false));
        PrivateDns.choose(1);
        org.junit.Assert.assertEquals("Google", PrivateDns.homeLabel(true, false));
        org.junit.Assert.assertEquals(PrivateDns.GOOGLE, PrivateDns.SERVERS.get(0));
        PrivateDns.choose(0);
        org.junit.Assert.assertEquals("Off", PrivateDns.homeLabel(false, false));
    }
}
