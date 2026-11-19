package uk.bmsupport.player;

import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Category IDs that actually hold content in a provider list, so adult categories the
 *  customer's playlist has no streams in are never listed (panels send every category name). */
final class AdultCategoryContent {
    private static final Pattern ID = Pattern.compile("\"category_ids?\"\\s*:\\s*\\[?\\s*\"?(\\d+)");
    private static final Pattern MORE = Pattern.compile("\"category_ids\"\\s*:\\s*\\[([^\\]]*)\\]");
    private AdultCategoryContent() {}

    static Set<String> usedIds(String rawList) {
        Set<String> out = new HashSet<>();
        if (rawList == null) return out;
        Matcher m = ID.matcher(rawList);
        while (m.find()) out.add(m.group(1));
        Matcher a = MORE.matcher(rawList);
        while (a.find()) for (String p : a.group(1).split(",")) { String id = p.replaceAll("[^0-9]", ""); if (!id.isEmpty()) out.add(id); }
        return out;
    }

    /** True when an adult category has nothing in the playlist (only judged when the list is known). */
    static boolean emptyAdult(boolean adult, String id, Set<String> used) {
        return adult && used != null && !used.contains(id);
    }
}
