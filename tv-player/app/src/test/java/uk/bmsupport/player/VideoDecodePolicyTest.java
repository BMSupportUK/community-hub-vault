package uk.bmsupport.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class VideoDecodePolicyTest {
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
}