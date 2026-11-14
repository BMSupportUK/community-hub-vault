package uk.bmsupport.player;

import android.content.SharedPreferences;
import org.json.JSONArray;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Device-local, login-scoped category overrides. Content inside categories is untouched. */
final class CategoryOrder {
    static String key(SharedPreferences prefs, String kind) {
        String scope = prefs.getString("dns", "").replaceAll("/+$", "") + "\n" + prefs.getString("user", "");
        try {
            byte[] hash = java.security.MessageDigest.getInstance("SHA-256").digest(scope.getBytes("UTF-8"));
            StringBuilder out = new StringBuilder();
            for (byte b : hash) out.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
            return "category_order_" + out + "_" + kind;
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
    static List<String[]> apply(List<String[]> rows, String saved) {
        Map<String, Integer> rank = new HashMap<>();
        try {
            JSONArray ids = new JSONArray(saved);
            for (int i = 0; i < ids.length(); i++) {
                String id = ids.optString(i);
                if (!id.isEmpty() && !rank.containsKey(id)) rank.put(id, i);
            }
        } catch (Exception ignored) {}
        List<String[]> sorted = new ArrayList<>(rows);
        sorted.sort((a,b) -> {
            if ("*".equals(a[0])) return "*".equals(b[0]) ? 0 : -1;
            if ("*".equals(b[0])) return 1;
            return Integer.compare(rank.getOrDefault(a[0], Integer.MAX_VALUE), rank.getOrDefault(b[0], Integer.MAX_VALUE));
        });
        return sorted;
    }
    static void save(SharedPreferences prefs, String kind, List<String[]> rows) {
        JSONArray ids = new JSONArray();
        for (String[] row : rows) if (!"*".equals(row[0])) ids.put(row[0]);
        prefs.edit().putString(key(prefs, kind), ids.toString()).apply();
    }
    static String hiddenKey(SharedPreferences prefs, String kind) { return key(prefs, kind) + "_hidden"; }
    static java.util.Set<String> hidden(SharedPreferences prefs, String kind) {
        return new java.util.HashSet<>(prefs.getStringSet(hiddenKey(prefs, kind), java.util.Collections.emptySet()));
    }
    static List<String[]> visible(List<String[]> rows, java.util.Set<String> hidden) {
        List<String[]> out = new ArrayList<>();
        for (String[] row : rows) if ("*".equals(row[0]) || !hidden.contains(row[0])) out.add(row);
        return out;
    }
}