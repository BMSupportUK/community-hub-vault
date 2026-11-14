package uk.bmsupport.player;
import org.junit.Test;
import static org.junit.Assert.*;
public class VoiceRecorderTest {
    @Test public void wavHeaderDescribes16kMono() {
        byte[] w = VoiceRecorder.wav(new byte[3200], 16000);
        assertEquals(3244, w.length);
        assertEquals("RIFF", new String(w, 0, 4)); assertEquals("WAVE", new String(w, 8, 4));
        java.nio.ByteBuffer b = java.nio.ByteBuffer.wrap(w).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        assertEquals(1, b.getShort(22)); assertEquals(16000, b.getInt(24)); assertEquals(3200, b.getInt(40));
    }
    @Test public void eightSecondsAtMaxStaysUnderWebsiteLimit() { assertTrue(44 + 16000 * 2 * 8 < 1_200_000); }
    @Test public void stopsAfterSpeechThenPauseOrAtCap() {
        assertFalse(VoiceRecorder.finished(false, 5000, 5000));
        assertTrue(VoiceRecorder.finished(true, 1200, 3000));
        assertFalse(VoiceRecorder.finished(true, 500, 3000));
        assertTrue(VoiceRecorder.finished(false, 0, 8000));
    }
    @Test public void silentMicCountsAsFlat() {
        assertTrue(new VoiceRecorder.Take(new byte[44], 10, false).flat());
        assertFalse(new VoiceRecorder.Take(new byte[44], 900, true).flat());
        assertEquals(1000, VoiceRecorder.rms(new short[]{1000, -1000}, 2));
    }
}
