package uk.bmsupport.player;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class SoundBoostTest {
    @Test public void levelsMapToGain() {
        assertEquals(0, SoundBoost.gainFor("off"));
        assertEquals(600, SoundBoost.gainFor("low"));
        assertEquals(1200, SoundBoost.gainFor("medium"));
        assertEquals(1800, SoundBoost.gainFor("high"));
        assertEquals(2400, SoundBoost.gainFor("max"));
    }
    @Test public void unsetLevelStartsAtMedium() { assertEquals("medium", SoundBoost.DEFAULT); }
    @Test public void enhancedLiveEngineStaysAtUnitySoPeaksAreLimitedNotClipped() {
        for (String level : SoundBoost.IDS) assertEquals(100, SoundBoost.vlcVolume(true, level, false));
        assertEquals(0, SoundBoost.vlcVolume(true, "max", true));
        assertEquals(200, SoundBoost.vlcVolume(false, "max", false));
    }
    @Test public void unknownLevelIsOff() { assertEquals(0, SoundBoost.gainFor("loud")); assertEquals(0, SoundBoost.gainFor(null)); }
    @Test public void buttonCycles() {
        assertEquals("low", SoundBoost.next("off"));
        assertEquals("max", SoundBoost.next("high"));
        assertEquals("off", SoundBoost.next("max"));
    }
    @Test public void liveGainHasNoEqualizerAttenuation() {
        assertEquals(100, SoundBoost.vlcVolumeFor("off", false));
        assertEquals(126, SoundBoost.vlcVolumeFor("low", false));
        assertEquals(158, SoundBoost.vlcVolumeFor("medium", false));
        assertEquals(200, SoundBoost.vlcVolumeFor("high", false));
    }
    @Test public void multiScreenMuteAlwaysOverridesBoost() {
        for (String level : SoundBoost.IDS) assertEquals(0, SoundBoost.vlcVolumeFor(level, true));
    }
    @Test public void boxVolumeIsRaisedOnlyWhenBoosterIsOn() {
        org.junit.Assert.assertFalse(SoundBoost.raisesDeviceVolume("off"));
        for (String level : new String[]{"low", "medium", "high", "max"}) org.junit.Assert.assertFalse(SoundBoost.raisesDeviceVolume(level));
    }
}
