package uk.bmsupport.player;
import org.json.JSONArray;
import org.json.JSONObject;
/** Website sports/club fixtures, not retired country EPG. */
final class FixtureGuide {
    interface Website { JSONObject read() throws Exception; }
    /** Ordinary general-TV stations never ask the website. Official sports brands do, so
     *  Sports Guide events matched to them (via the guide's playlist category) appear. */
    static boolean candidate(String name) {
        String n = name.toLowerCase(java.util.Locale.UK);
        return !n.matches("^(uk\\s*\\|\\s*)?(bbc\\b|itv\\b|channel [45]\\b|sky (cinema|atlantic|comedy|witness)\\b|discovery\\b|cartoon\\b|nickelodeon\\b|disney\\b|cnn\\b|abc:|cbs:|fox:|nbc:|pbs:|cw:).*");
    }
    /** The website's guide answer, or null (ordinary channel / unreachable). */
    static JSONObject fetch(String name, Website website) {
        if (!candidate(name)) return null;
        try { return website.read(); } catch (Exception ignored) { return null; }
    }
    /** Authoritative fixture slots (event-only feeds): replace the provider guide. */
    static JSONArray authoritative(JSONObject r) {
        return r != null && "sports".equals(r.optString("source")) ? r.optJSONArray("epg_listings") : null;
    }
    static JSONArray listings(String name, Website website) { return authoritative(fetch(name, website)); }
    /** Official channels: matched Sports Guide events take their slots, provider programmes fill the rest. */
    static JSONArray overlay(JSONObject r, JSONArray provider) {
        JSONArray ev = r != null && "sports_overlay".equals(r.optString("source")) ? r.optJSONArray("epg_listings") : null;
        if (ev == null || ev.length() == 0) return provider;
        java.util.List<JSONObject> out = new java.util.ArrayList<>();
        for (int i = 0; i < ev.length(); i++) { JSONObject e = ev.optJSONObject(i); if (e != null) out.add(e); }
        if (provider != null) for (int i = 0; i < provider.length(); i++) {
            JSONObject p = provider.optJSONObject(i); if (p == null) continue;
            long ps = p.optLong("start_timestamp", 0), pe = p.optLong("stop_timestamp", 0);
            boolean clash = false;
            for (int j = 0; j < ev.length() && !clash; j++) {
                JSONObject e = ev.optJSONObject(j); if (e == null) continue;
                clash = ps > 0 && pe > ps && ps < e.optLong("stop_timestamp") && pe > e.optLong("start_timestamp");
            }
            if (!clash) out.add(p);
        }
        out.sort((a, b) -> Long.compare(a.optLong("start_timestamp", 0), b.optLong("start_timestamp", 0)));
        JSONArray a = new JSONArray(); for (JSONObject o : out) a.put(o); return a;
    }
}
