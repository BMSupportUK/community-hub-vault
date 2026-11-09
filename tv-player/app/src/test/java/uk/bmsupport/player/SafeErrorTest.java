package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class SafeErrorTest {
    @Test public void hidesWebAddress() { assertEquals(SafeError.PLAYBACK, SafeError.forScreen("Can't play this file http://dns.example.com:8080/live/u/p/1.ts")); }
    @Test public void hidesHostAndPort() { assertEquals(SafeError.PLAYBACK, SafeError.forScreen("Location line.example.net:25461 couldn't be played")); }
    @Test public void hidesIpAddress() { assertEquals(SafeError.PLAYBACK, SafeError.forScreen("Failed to connect to 51.89.12.4")); }
    @Test public void hidesLoginPath() { assertEquals(SafeError.PLAYBACK, SafeError.forScreen("Not found /live/bob/secret/123.m3u8")); }
    @Test public void keepsPlainMessage() { assertEquals("Enter all 6 digits.", SafeError.forScreen("Enter all 6 digits.")); }
}
