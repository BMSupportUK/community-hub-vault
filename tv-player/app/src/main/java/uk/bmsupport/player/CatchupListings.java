package uk.bmsupport.player;

import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONObject;

/** Provider EPG timestamps vary between seconds, milliseconds and local date strings. */
final class CatchupListings {
    static long time(JSONObject row, boolean end, String zone) {
        String[] keys = end ? new String[]{"stop_timestamp", "end_timestamp", "end", "stop"}
                : new String[]{"start_timestamp", "start"};
        for (String key : keys) {
            String value = row.optString(key, "").trim();
            try {
                long n = Long.parseLong(value);
                if (n > 0) return n > 100000000000L ? n / 1000 : n;
            } catch (NumberFormatException ignored) {}
            for (String pattern : new String[]{"yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ssXXX", "yyyy-MM-dd HH:mm"}) {
                try {
                    SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.UK);
                    format.setLenient(false);
                    format.setTimeZone(TimeZone.getTimeZone(zone));
                    java.text.ParsePosition pos = new java.text.ParsePosition(0);
                    java.util.Date date = format.parse(value, pos);
                    if (date != null && pos.getIndex() == value.length()) return date.getTime() / 1000;
                } catch (IllegalArgumentException ignored) {}
            }
        }
        return 0;
    }

    static boolean available(JSONObject row, long start, long end, long now, int days) {
        return start > 0 && end > start && start >= now - days * 86400L && end <= now
                && (!row.has("has_archive") || row.optInt("has_archive", 1) != 0);
    }
}