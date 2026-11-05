package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class PreviewCountTest {
    @Test public void previewNoteClearsWhenPreviewStops() { assertTrue(MainActivity.previewStopClearsNowPlaying(true, true)); }
    @Test public void realPlaybackStartedFromPreviewSurvives() { assertFalse(MainActivity.previewStopClearsNowPlaying(true, false)); }
    @Test public void vlcStartedFromPreviewSurvives() { assertFalse(MainActivity.previewStopClearsNowPlaying(true, false)); }
    @Test public void noPreviewCountNeverClears() { assertFalse(MainActivity.previewStopClearsNowPlaying(false, true)); assertFalse(MainActivity.previewStopClearsNowPlaying(false, false)); }
}
