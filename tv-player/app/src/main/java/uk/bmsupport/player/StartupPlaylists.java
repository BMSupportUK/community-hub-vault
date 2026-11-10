package uk.bmsupport.player;

import java.util.Arrays;
import java.util.List;

/** Fresh lists on each main-screen startup; never repeat on menu redraws. */
final class StartupPlaylists {
    private boolean started;
    List<String> claim(boolean signedIn) {
        if (!signedIn || started) return java.util.Collections.emptyList();
        started = true;
        return Arrays.asList("live", "film", "series");
    }
}