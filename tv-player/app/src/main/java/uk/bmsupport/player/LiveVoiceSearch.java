package uk.bmsupport.player;

import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Voice-only grouping; never changes ordinary typed channel search. */
final class LiveVoiceSearch {
    static final class Row {
        final String group, title, subtitle;
        final JSONObject value;
        Row(String group, String title, String subtitle, JSONObject value) {
            this.group = group; this.title = title; this.subtitle = subtitle; this.value = value;
        }
        boolean selectable() { return value != null; }
    }
    static String query(String spoken) {
        return (spoken == null ? "" : spoken).replaceAll("(?i)\\b(?:please|show|me|find|watch|play|the|a|on|today|tonight|now|live|tv|channel|channels|category|categories|event|events)\\b", " ").replaceAll("\\s+", " ").trim();
    }
    static List<Row> results(JSONArray categories, JSONArray channels, String spoken) {
        String query = query(spoken);
        List<Row> rows = new ArrayList<>();
        for (String group : new String[]{"Categories", "TV channels"}) {
            List<Row> hits = new ArrayList<>();
            JSONArray source = group.equals("Categories") ? categories : channels;
            if (!query.isEmpty() && source != null) for (int i = 0; i < source.length(); i++) {
                JSONObject value = source.optJSONObject(i); if (value == null) continue;
                String title = value.optString(group.equals("Categories") ? "category_name" : "name");
                String hay = title, subtitle = "";
                if (group.equals("Categories")) {
                    boolean populated = false;
                    if (channels != null) for (int j = 0; j < channels.length(); j++) {
                        JSONObject ch = channels.optJSONObject(j);
                        if (ch != null && ch.optString("category_id").equals(value.optString("category_id"))) { populated = true; break; }
                    }
                    if (!populated) continue;
                } else if (group.equals("TV channels")) {
                    if (categories != null) for (int j = 0; j < categories.length(); j++) {
                        JSONObject cat = categories.optJSONObject(j);
                        if (cat != null && cat.optString("category_id").equals(value.optString("category_id"))) { subtitle = cat.optString("category_name"); break; }
                    }
                }
                if (LiveSearch.matches(hay, query)) hits.add(new Row(group, title, subtitle, value));
            }
            rows.add(new Row(group, group + " (" + hits.size() + ")", "", null));
            rows.addAll(hits);
            if (hits.isEmpty()) rows.add(new Row(group, "No matching " + group.toLowerCase(java.util.Locale.UK), "", null));
        }
        return rows;
    }
}