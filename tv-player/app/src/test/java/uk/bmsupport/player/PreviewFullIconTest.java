package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class PreviewFullIconTest {
    @Test public void iconShowsOnlyWhileThePreviewIsPlaying() {
        assertTrue(PreviewFullIcon.shows(true));
        assertFalse(PreviewFullIcon.shows(false));
    }

    @Test public void iconOpensOnlyTheChannelThePreviewIsShowing() {
        assertTrue(PreviewFullIcon.opens("101", true));
        assertFalse("no preview loaded yet: nothing to open" , PreviewFullIcon.opens(null, true));
        assertFalse("preview stopped: the icon is not there to press", PreviewFullIcon.opens("101", false));
        assertFalse(PreviewFullIcon.opens(null, false));
    }
}
