package uk.bmsupport.player;

/** Provider episode titles often repeat the series name and S01E03 code; cards show only the episode's own title. */
final class EpisodeName {
    static String clean(String title, String series) {
        String t = title == null ? "" : title.trim();
        String sep = "[\\s.:|_\\-\u2013\u2014]*";
        if (series != null && !series.trim().isEmpty()) {
            String s = series.trim().replaceAll("\\s*\\(\\d{4}\\)$", "");
            String q = java.util.regex.Pattern.quote(s);
            t = t.replaceAll("(?i)^" + q + "(\\s*\\(\\d{4}\\))?" + sep, "");
        }
        t = t.replaceAll("(?i)^(S\\d{1,3}\\s*E\\d{1,4}|\\d{1,3}x\\d{1,4}|E\\d{1,4}|Season\\s*\\d+\\s*Episode\\s*\\d+|Episode\\s*\\d+)" + sep, "");
        return t.trim();
    }
}
