package uk.bmsupport.player;

import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.TreeMap;

/** Turns provider EPG listings into the Live TV guide's programme list: sorted, de-duplicated, only what is still to come. */
public final class GuideListings {
    private GuideListings() {}

    /** Visible channel rows re-check website fixtures on the guide's minute tick. */
    public static final long REFRESH_SECS = 60;

    public static List<GuideGridView.Prog> parse(JSONArray l, long now) {
        TreeMap<Long, GuideGridView.Prog> byStart = new TreeMap<>();
        if (l != null) for (int i = 0; i < l.length(); i++) {
            JSONObject e = l.optJSONObject(i);
            if (e == null) continue;
            long st = e.optLong("start_timestamp", 0), en = e.optLong("stop_timestamp", 0);
            if (st <= 0 || (en > 0 && en <= now - 3600)) continue;
            String t = e.optString("title", "");
            try { t = new String(Base64.decode(t, Base64.DEFAULT), "UTF-8"); } catch (Exception ignored) {}
            if (t.trim().isEmpty()) t = "Programme";
            if (!byStart.containsKey(st)) {
                GuideGridView.Prog pr = new GuideGridView.Prog(t, st, en);
                String d = e.optString("description", "");
                try { d = new String(Base64.decode(d, Base64.DEFAULT), "UTF-8"); } catch (Exception ignored) {}
                pr.desc = d.trim();
                byStart.put(st, pr);
            }
        }
        return new ArrayList<>(byStart.values());
    }

    /** Drops programmes that have already ended, so row 0 is "Now" (BM Support sends the last few hours too). */
    public static JSONArray upcoming(JSONArray l, long now) {
        if (l == null) return null;
        JSONArray out = new JSONArray();
        for (int i = 0; i < l.length(); i++) {
            JSONObject e = l.optJSONObject(i);
            if (e != null && e.optLong("stop_timestamp", 0) > now) out.put(e);
        }
        return out.length() > 0 ? out : null;
    }

    /** True when the line-up only reaches "now" (or nothing), so the full day's table is worth fetching. */
    public static boolean tooShort(List<GuideGridView.Prog> l, long now, long window) {
        if (l == null || l.size() < 2) return true;
        GuideGridView.Prog last = l.get(l.size() - 1);
        long end = last.en > 0 ? last.en : last.st;
        return end < now + window;
    }

    /** True when a cached line-up is too old or has run out, so the guide should fetch again. */
    public static boolean stale(long fetchedAt, List<GuideGridView.Prog> l, long now, long window) {
        return stale(fetchedAt, l, now, window, now + window, false);
    }

    /** Same, but also stale when the line-up stops before the time span on screen (a later day), unless the full table was already asked for. */
    public static boolean stale(long fetchedAt, List<GuideGridView.Prog> l, long now, long window, long viewEnd, boolean fullFetched) {
        if (now - fetchedAt >= REFRESH_SECS) return true;
        if (!fullFetched && l != null && !l.isEmpty()) {
            GuideGridView.Prog z = l.get(l.size() - 1);
            if ((z.en > 0 ? z.en : z.st) < viewEnd) return true;
        }
        if (l == null || l.isEmpty()) return now - fetchedAt >= 120;
        GuideGridView.Prog last = l.get(l.size() - 1);
        return (last.en > 0 ? last.en : last.st) < now + window / 2;
    }

    static List<GuideGridView.Prog> sorted(List<GuideGridView.Prog> l) {
        List<GuideGridView.Prog> c = new ArrayList<>(l);
        Collections.sort(c, (a, b) -> Long.compare(a.st, b.st));
        return c;
    }
}
