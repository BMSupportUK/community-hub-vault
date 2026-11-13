package uk.bmsupport.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class VideoDecodePolicyTest {
    @Test public void moviePremiereAcceptsBothPictureMarkersOnHardware() {
        assertFalse(VideoDecodePolicy.cleanKeyframes(false, "Movie Premiere ᴴᴰ"));
        assertFalse(VideoDecodePolicy.cleanKeyframes(false, "UK | Movie Premiere HD"));
        assertFalse(VideoDecodePolicy.preferSoftware(false, "hardware", "Movie Premiere ᴴᴰ"));
        assertFalse(VideoDecodePolicy.cleanKeyframes(false, "BBC One | FHD |"));
        assertFalse(VideoDecodePolicy.cleanKeyframes(false, "Movie Extra HD"));
    }
    @Test public void monomaxUsesSoftwareAndCleanFrames() {
        assertFalse(VideoDecodePolicy.preferSoftware(false, "hardware", "TH | MonoMax 27"));
        assertTrue(VideoDecodePolicy.cleanKeyframes(false, "Mono Max 01"));
    }
    @Test public void softwareSettingAndCatchupPreferSoftware() {
        assertTrue(VideoDecodePolicy.preferSoftware(false, "software", "Sky Sports"));
        assertTrue(VideoDecodePolicy.preferSoftware(true, "hardware", null));
    }
    @Test public void ordinaryUhdKeepsHardwareDefault() {
        assertFalse(VideoDecodePolicy.preferSoftware(false, "hardware", "Sky Sports UHD"));
        assertFalse(VideoDecodePolicy.cleanKeyframes(false, "Sky Sports UHD"));
    }
    @Test public void highLevelH264DecodesLowLatencyWhateverTheChannel() {
        assertTrue(VideoDecodePolicy.lowLatencyDecode("avc1.640033"));
        assertTrue(VideoDecodePolicy.lowLatencyDecode("avc1.640032"));
        assertFalse(VideoDecodePolicy.lowLatencyDecode("avc1.640028"));
        assertFalse(VideoDecodePolicy.lowLatencyDecode("hvc1.2.4.L153"));
        assertFalse(VideoDecodePolicy.lowLatencyDecode(null));
    }
    @Test public void mediaTekBoxesFeedTheVideoChipSynchronously() {
        assertTrue(VideoDecodePolicy.synchronousFeed("mt8696", "Mediatek"));
        assertTrue(VideoDecodePolicy.synchronousFeed("mt5895", ""));
        assertFalse(VideoDecodePolicy.synchronousFeed("amlogic", "Amlogic"));
        assertFalse(VideoDecodePolicy.synchronousFeed(null, null));
    }
}
