package uk.bmsupport.player;

import java.text.Normalizer;
import java.util.Locale;

final class LiveSearch {
    private LiveSearch() {}
    private static String normalize(String value) {
        return Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFKD)
                .replaceAll("\\p{M}+", "").toLowerCase(Locale.UK)
                .replaceAll("\\bsports\\b", "sport").replaceAll("[^a-z0-9]+", " ").trim();
    }
    static boolean matches(String name, String query) {
        String hay = normalize(name), want = normalize(query);
        if (want.isEmpty()) return true;
        for (String token : want.split("\\s+")) if (!hay.contains(token)) return false;
        return true;
    }
}