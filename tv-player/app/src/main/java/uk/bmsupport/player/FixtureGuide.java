package uk.bmsupport.player;
import org.json.JSONArray;
import org.json.JSONObject;
/** Website sports/club fixtures, not retired country EPG. */
final class FixtureGuide {
    interface Website { JSONObject read() throws Exception; }
    static boolean candidate(String name) {
        String n = name.toLowerCase(java.util.Locale.UK);
        return !n.matches(".*\\b(sky sports|tnt sports|bt sport|eurosport|premier sports|espn|bein sports|fox sports|nbc sports|cbs sports|tsn|sportsnet|supersport|willow|ten sports|star sports|sony sports)\\b.*")
            && !n.matches("^(uk\\s*\\|\\s*)?(bbc\\b|itv\\b|channel [45]\\b|sky (cinema|atlantic|comedy|witness)\\b|discovery\\b|cartoon\\b|nickelodeon\\b|disney\\b|cnn\\b|abc:|cbs:|fox:|nbc:|pbs:|cw:).*");
    }
    static JSONArray listings(String name, Website website) {
        if (!candidate(name)) return null;
        try { JSONObject r = website.read(); return "sports".equals(r.optString("source")) ? r.optJSONArray("epg_listings") : null; }
        catch (Exception ignored) { return null; }
    }
}