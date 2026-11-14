package uk.bmsupport.player;

import java.util.Locale;

/** A–Z ordering for search results the way a person reads it: provider tags like "UK:", "|UK|", "[VIP]", emoji and
 *  punctuation in front are ignored, and numbers count as numbers, so "Sky Sports 2" comes before "Sky Sports 10". */
final class SearchOrder {
    private SearchOrder() {}
    private static final java.util.regex.Pattern LEAD_TAG = java.util.regex.Pattern.compile(
            "^(?:\\s*(?:\\|[^|]{1,12}\\||\\[[^\\]]{1,12}\\]|\\([^)]{1,12}\\)|[A-Za-z]{2,4}\\s*[:|]|[A-Za-z]{2,4}\\s+-\\s))+");
    static String key(String name) {
        String s = name == null ? "" : name.trim();
        String stripped = LEAD_TAG.matcher(s).replaceFirst("");
        if (!stripped.trim().isEmpty()) s = stripped;
        int i = 0;
        while (i < s.length() && !Character.isLetterOrDigit(s.codePointAt(i))) i += Character.charCount(s.codePointAt(i));
        String out = s.substring(i).trim().toLowerCase(Locale.UK);
        return out.isEmpty() ? (name == null ? "" : name.toLowerCase(Locale.UK)) : out;
    }
    static int compare(String a, String b) {
        String x = key(a), y = key(b);
        int i = 0, j = 0;
        while (i < x.length() && j < y.length()) {
            char cx = x.charAt(i), cy = y.charAt(j);
            if (Character.isDigit(cx) && Character.isDigit(cy)) {
                int si = i, sj = j;
                while (i < x.length() && Character.isDigit(x.charAt(i))) i++;
                while (j < y.length() && Character.isDigit(y.charAt(j))) j++;
                String nx = x.substring(si, i).replaceFirst("^0+(?=.)", ""), ny = y.substring(sj, j).replaceFirst("^0+(?=.)", "");
                if (nx.length() != ny.length()) return nx.length() - ny.length();
                int c = nx.compareTo(ny); if (c != 0) return c;
            } else {
                if (cx != cy) return cx - cy;
                i++; j++;
            }
        }
        int c = (x.length() - i) - (y.length() - j);
        if (c != 0) return c;
        return (a == null ? "" : a).compareToIgnoreCase(b == null ? "" : b);
    }
}
