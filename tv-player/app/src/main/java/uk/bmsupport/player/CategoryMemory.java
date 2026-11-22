package uk.bmsupport.player;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Remembers the last category picked in each section (Films, Series) so backing out of a
 * category and going back in reopens the category list where you were, not back at the top.
 * Live TV keeps its own liveCatId; this covers the poster sections.
 */
final class CategoryMemory {
    private final Map<String, String> picked = new HashMap<>();

    void save(String kind, String categoryId) {
        if (kind == null || categoryId == null) return;
        picked.put(kind, categoryId);
    }

    String saved(String kind) {
        return picked.get(kind);
    }

    /** Row index of the saved category, or 0 (top) when none was saved or it is gone. */
    int restoreIndex(String kind, List<String[]> rows) {
        String id = saved(kind);
        if (id != null) {
            for (int i = 0; i < rows.size(); i++) {
                if (rows.get(i)[0].equals(id)) return i;
            }
        }
        return 0;
    }

    /** Saved category, else the first category whose name contains the default word, else the top row. */
    int startIndex(String kind, List<String[]> rows, String defaultWord) {
        int at = indexOf(rows, saved(kind));
        if (at >= 0) return at;
        for (int i = 0; i < rows.size(); i++) {
            if (rows.get(i)[1] != null && rows.get(i)[1].toLowerCase().contains(defaultWord)) return i;
        }
        return 0;
    }

    /** Row index of a category id, or -1 when it is not listed. */
    static int indexOf(List<String[]> rows, String categoryId) {
        if (categoryId == null) return -1;
        for (int i = 0; i < rows.size(); i++) {
            if (rows.get(i)[0].equals(categoryId)) return i;
        }
        return -1;
    }
}
