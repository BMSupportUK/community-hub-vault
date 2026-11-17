package uk.bmsupport.player;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Numbered sibling channels (Stan Sport 1, 2 … 30) read 1, 2, 3 upwards; everything else keeps the provider's order. */
final class ChannelNumberOrder {
    private ChannelNumberOrder() {}
    private static final Pattern NUM = Pattern.compile("^(.*?\\D)\\s*(\\d{1,4})(\\s*(?:\\b(?:uhd|4k|fhd|hd|sd)\\b)?)\\s*$", Pattern.CASE_INSENSITIVE);

    static <T> void sort(List<T> list, Function<T, String> name) {
        Map<String, List<Integer>> slots = new HashMap<>();
        for (int i = 0; i < list.size(); i++) {
            String k = key(name.apply(list.get(i)));
            if (k != null) slots.computeIfAbsent(k, x -> new ArrayList<>()).add(i);
        }
        for (List<Integer> idx : slots.values()) {
            if (idx.size() < 2) continue;
            List<T> group = new ArrayList<>();
            for (int i : idx) group.add(list.get(i));
            group.sort((a, b) -> Integer.compare(number(name.apply(a)), number(name.apply(b))));
            for (int j = 0; j < idx.size(); j++) list.set(idx.get(j), group.get(j));
        }
    }

    private static String clean(String s) {
        if (s == null) return "";
        int bar = s.lastIndexOf('|');
        String t = bar >= 0 && bar < s.length() - 1 ? s.substring(bar + 1) : s;
        return t.trim();
    }
    static String key(String name) {
        Matcher m = NUM.matcher(clean(name));
        if (!m.matches()) return null;
        return (name.contains("|") ? name.substring(0, name.lastIndexOf('|')).trim().toLowerCase() + "|" : "")
                + m.group(1).trim().toLowerCase() + "#" + m.group(3).trim().toLowerCase();
    }
    static int number(String name) {
        Matcher m = NUM.matcher(clean(name));
        return m.matches() ? Integer.parseInt(m.group(2)) : Integer.MAX_VALUE;
    }
}
