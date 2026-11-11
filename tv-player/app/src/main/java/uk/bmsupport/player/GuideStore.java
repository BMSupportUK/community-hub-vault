package uk.bmsupport.player;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Saves the TV guide's listings on the box so the next open shows them at once, then refreshes quietly. */
final class GuideStore {
    private GuideStore() {}
    static final long MAX_AGE_SECS = 12 * 3600;

    static String encode(Map<String, List<GuideGridView.Prog>> rows, long now) {
        try {
            JSONObject root = new JSONObject().put("saved", now);
            JSONObject ch = new JSONObject();
            for (Map.Entry<String, List<GuideGridView.Prog>> e : rows.entrySet()) {
                JSONArray a = new JSONArray();
                for (GuideGridView.Prog p : e.getValue()) {
                    if ((p.en > 0 ? p.en : p.st) < now) continue; // finished programmes are not worth keeping
                    a.put(new JSONArray().put(p.title).put(p.st).put(p.en).put(p.desc == null ? "" : p.desc));
                }
                if (a.length() > 0) ch.put(e.getKey(), a);
            }
            return root.put("ch", ch).toString();
        } catch (Exception e) { return ""; }
    }

    /** Listings still useful now; empty when the save is missing, broken or over 12 hours old. */
    static Map<String, List<GuideGridView.Prog>> decode(String text, long now) {
        Map<String, List<GuideGridView.Prog>> out = new LinkedHashMap<>();
        try {
            JSONObject root = new JSONObject(text);
            if (now - root.optLong("saved", 0) > MAX_AGE_SECS) return out;
            JSONObject ch = root.getJSONObject("ch");
            java.util.Iterator<String> keys = ch.keys();
            while (keys.hasNext()) {
                String id = keys.next();
                JSONArray a = ch.getJSONArray(id);
                List<GuideGridView.Prog> l = new ArrayList<>();
                for (int i = 0; i < a.length(); i++) {
                    JSONArray r = a.getJSONArray(i);
                    long en = r.optLong(2);
                    if ((en > 0 ? en : r.optLong(1)) < now) continue;
                    GuideGridView.Prog p = new GuideGridView.Prog(r.optString(0), r.optLong(1), en);
                    p.desc = r.optString(3, "");
                    l.add(p);
                }
                if (!l.isEmpty()) out.put(id, l);
            }
        } catch (Exception ignored) {}
        return out;
    }
}
