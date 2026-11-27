package uk.bmsupport.player;

import org.json.JSONObject;

/** Keep the provider's full text, including its final sentence and paragraphs. */
final class MovieDescription {
    static String fromResponse(JSONObject response) {
        if (response == null) return "";
        JSONObject[] sources = {response.optJSONObject("info"), response.optJSONObject("movie_data"), response};
        for (JSONObject source : sources) {
            if (source == null) continue;
            for (String field : new String[]{"plot", "description"}) {
                Object value = source.opt(field);
                if (!(value instanceof String)) continue;
                String text = ((String) value).trim();
                if (!text.isEmpty() && !text.equalsIgnoreCase("null") && !text.equalsIgnoreCase("undefined")) return text;
            }
        }
        return "";
    }
}