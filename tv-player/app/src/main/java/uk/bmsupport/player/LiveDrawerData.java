package uk.bmsupport.player;

import java.util.ArrayList;
import java.util.List;

/**
 * The live categories and channels the TV guide last loaded, kept so the full-screen player can
 * slide the same category drawer over the playing picture (Left on a TV remote) and switch
 * channel without going back to the guide first. A pick is handed to the main screen as a
 * channel id; the main screen opens it through the normal playback path.
 */
final class LiveDrawerData {
    static final class Channel {
        final String id, name, categoryId, categoryName;
        final String[] urls;
        Channel(String id, String name, String categoryId, String categoryName, String[] urls) {
            this.id = id; this.name = name; this.categoryId = categoryId; this.categoryName = categoryName; this.urls = urls;
        }
    }

    private static final List<String[]> categories = new ArrayList<>(); // {id, name}
    private static final List<Channel> channels = new ArrayList<>();
    /** Channel id chosen from the player drawer, waiting for the main screen to open it. */
    static String pendingPick;

    private LiveDrawerData() {}

    static synchronized void set(List<String[]> catRows, List<Channel> chans) {
        categories.clear(); channels.clear();
        if (catRows != null) categories.addAll(catRows);
        if (chans != null) channels.addAll(chans);
    }

    static synchronized boolean ready() { return !categories.isEmpty() && !channels.isEmpty(); }

    static synchronized List<String[]> categories() { return new ArrayList<>(categories); }

    static synchronized List<Channel> channelsIn(String categoryId) {
        List<Channel> out = new ArrayList<>();
        for (Channel c : channels) if ("*".equals(categoryId) || categoryId.equals(c.categoryId)) out.add(c);
        return out;
    }

    static synchronized Channel find(String id) {
        if (id == null) return null;
        for (Channel c : channels) if (id.equals(c.id)) return c;
        return null;
    }
}
