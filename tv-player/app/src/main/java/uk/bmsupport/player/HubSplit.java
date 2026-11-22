package uk.bmsupport.player;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Splits the provider's "EPL | Premier League Hub" Live TV category into one category per
 * overseas broadcaster (Stan Sport, Star Hub Premier, Fubo Sports, Premier League+, Astro),
 * with the remaining channels kept in the original category renamed "... | Other".
 * Split categories get the id "<hubId>~<slug>", so they never clash with provider ids.
 */
final class HubSplit {
    private HubSplit() {}

    static final String SEP = "~";
    static final String[][] GROUPS = {
        {"stan", "Stan Sport"}, {"starhub", "Star Hub Premier"}, {"fubo", "Fubo Sports"},
        {"plplus", "Premier League+"}, {"astro", "Astro Premier League"}, {"nowhk", "Now HK Sports"},
        {"flowsport", "Flowsport"}, {"monomax", "Monomax"}, {"coupang", "Coupang Play"},
    };

    static boolean isHub(String categoryName) {
        if (categoryName == null) return false;
        String n = categoryName.toLowerCase(java.util.Locale.ROOT).replaceAll("\\s+", " ").trim();
        return n.contains("premier league hub");
    }

    /** Slug of the broadcaster group a Hub channel belongs to, or null for Other. */
    static String group(String channelName) {
        if (channelName == null) return null;
        String n = channelName.toLowerCase(java.util.Locale.ROOT).replaceAll("\\s+", " ").trim();
        if (n.contains("coupang")) return "coupang";
        if (n.startsWith("stan sport")) return "stan";
        if (n.startsWith("star hub") || n.startsWith("starhub")) return "starhub";
        if (n.startsWith("fubo")) return "fubo";
        if (n.startsWith("premier league+") || n.startsWith("premier league +")) return "plplus";
        if (n.startsWith("astro")) return "astro";
        if (n.startsWith("now hk") || n.startsWith("nowhk")) return "nowhk";
        if (n.startsWith("flowsport")) return "flowsport";
        if (n.startsWith("monomax")) return "monomax";
        return null;
    }

    static String label(String hubName, String slug) {
        for (String[] g : GROUPS) if (g[0].equals(slug)) return hubName.trim() + " | " + g[1];
        return hubName.trim() + " | Other";
    }

    /** Real provider category id behind a (possibly split) id. */
    static String parentId(String id) {
        if (id == null) return null;
        int i = id.indexOf(SEP);
        return i < 0 ? id : id.substring(0, i);
    }

    /** Category list with each Hub category replaced by its broadcaster categories, in place. */
    static String categories(String body) {
        try {
            if (body == null || !body.toLowerCase(java.util.Locale.ROOT).contains("premier league hub")) return body;
            JSONArray in = new JSONArray(body), out = new JSONArray();
            for (int i = 0; i < in.length(); i++) {
                JSONObject o = in.optJSONObject(i);
                if (o == null || !isHub(o.optString("category_name"))) { out.put(o); continue; }
                String id = o.optString("category_id"), name = o.optString("category_name");
                for (String[] g : GROUPS) {
                    JSONObject c = new JSONObject(o.toString());
                    c.put("category_id", id + SEP + g[0]); c.put("category_name", label(name, g[0]));
                    out.put(c);
                }
                JSONObject rest = new JSONObject(o.toString());
                rest.put("category_name", label(name, null));
                out.put(rest);
            }
            return out.toString();
        } catch (Exception e) { return body; }
    }

    /** Stream list with Hub channels moved into their broadcaster category ids. */
    static String streams(String body, java.util.Set<String> hubIds) {
        try {
            if (body == null || hubIds == null || hubIds.isEmpty()) return body;
            JSONArray a = new JSONArray(body);
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.optJSONObject(i);
                if (o == null || !hubIds.contains(o.optString("category_id"))) continue;
                String g = group(o.optString("name"));
                if (g != null) o.put("category_id", o.optString("category_id") + SEP + g);
            }
            return a.toString();
        } catch (Exception e) { return body; }
    }

    /** Provider category ids whose name is a Hub category. */
    static java.util.Set<String> hubIds(String categoriesBody) {
        java.util.Set<String> ids = new java.util.HashSet<>();
        try {
            JSONArray a = new JSONArray(categoriesBody);
            for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null && isHub(o.optString("category_name"))) ids.add(o.optString("category_id")); }
        } catch (Exception ignored) {}
        return ids;
    }
}
