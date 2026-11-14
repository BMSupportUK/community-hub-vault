package uk.bmsupport.player;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class SoundBoostTest {
    @Test public void levelsMapToGain() {
        assertEquals(0, SoundBoost.gainFor("off"));
        assertEquals(600, SoundBoost.gainFor("low"));
        assertEquals(1200, SoundBoost.gainFor("medium"));
        assertEquals(1800, SoundBoost.gainFor("high"));
    }
    @Test public void unknownLevelIsOff() { assertEquals(0, SoundBoost.gainFor("loud")); assertEquals(0, SoundBoost.gainFor(null)); }
    @Test public void buttonCycles() {
        assertEquals("low", SoundBoost.next("off"));
        assertEquals("off", SoundBoost.next("high"));
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
}
