package uk.bmsupport.player;

import java.util.Locale;
import java.util.regex.Pattern;

/** Spoken search parity with the desktop Sports Guide; independent of speech-service availability. */
final class SportsVoiceSearch {
    private static final Pattern FILLER = Pattern.compile("\\b(?:v|vs|versus|and|the|fc|afc|match|game|on|watch|show|me|find|play|a|for|please|tonight|today|now|live|is|it|what|where|channel|channels|sports|sport|guide)\\b");
    private static String normal(String text) {
        return java.text.Normalizer.normalize(text == null ? "" : text, java.text.Normalizer.Form.NFKD)
                .replaceAll("[\\p{M}]", "").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }
    static String query(String spoken) { return FILLER.matcher(normal(spoken)).replaceAll(" ").replaceAll("\\s+", " ").trim(); }
    static boolean matches(String text, String spoken) {
        String query = query(spoken);
        if (query.isEmpty()) return false;
        String[] words = query.split(" ");
        String normalized = normal(text), hay = " " + normalized + " ", joined = normalized.replace(" ", "");
        int found = 0;
        for (int i = 0; i < words.length; i++) {
            if (hay.contains(" " + words[i])) found++;
            else if (i + 1 < words.length && hay.contains(" " + words[i] + words[i + 1])) { found += 2; i++; }
            else if (joined.contains(words[i])) found++;
        }
        return found == words.length || (words.length >= 3 && found >= words.length - 1);
    }
}