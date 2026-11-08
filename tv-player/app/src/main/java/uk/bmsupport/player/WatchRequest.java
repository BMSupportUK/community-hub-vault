package uk.bmsupport.player;

import java.util.List;

/** Picks the playlist entry a website "Watch on my box" request means: provider id first, then exact title. */
final class WatchRequest {
    private WatchRequest() {}
    static String clean(String s) {
        return s == null ? "" : java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFKC).replaceAll("\\s*\\(\\d{4}\\)\\s*$", "").trim().toLowerCase(java.util.Locale.UK);
    }
    static MainActivity.Item find(List<MainActivity.Item> all, String id, String title) {
        if (id != null && !id.isEmpty()) for (MainActivity.Item it : all) if (id.equals(it.id)) return it;
        String t = clean(title);
        if (!t.isEmpty()) for (MainActivity.Item it : all) if (t.equals(clean(it.name))) return it;
        return null;
    }
}
