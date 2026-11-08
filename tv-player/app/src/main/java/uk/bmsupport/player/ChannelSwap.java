package uk.bmsupport.player;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Builds the Swap channel list: same-event feeds first, then other versions of the channel; Not working ones last. */
final class ChannelSwap {
    static final int MAX = 12;
    /** Stalls inside StreamRecovery's window before the player offers a swap by itself. */
    static final int AUTO_STALLS = 3;

    static final class Option {
        final String id, name, recoveryName; final String[] urls; final boolean sameEvent; boolean down;
        Option(String id, String name, String recoveryName, String[] urls, boolean sameEvent) {
            this.id = id; this.name = name; this.recoveryName = recoveryName; this.urls = urls; this.sameEvent = sameEvent;
        }
    }

    private ChannelSwap() {}

    static List<Option> build(String currentId, List<Option> event, List<Option> variants, Set<String> downNames) {
        List<Option> working = new ArrayList<>(), broken = new ArrayList<>();
        Set<String> seen = new HashSet<>(); if (currentId != null) seen.add(currentId);
        List<Option> all = new ArrayList<>(); if (event != null) all.addAll(event); if (variants != null) all.addAll(variants);
        for (Option o : all) {
            if (o == null || o.id == null || o.urls == null || o.urls.length == 0 || !seen.add(o.id)) continue;
            o.down = downNames != null && o.name != null && downNames.contains(o.name.toLowerCase(Locale.ROOT));
            (o.down ? broken : working).add(o);
        }
        working.addAll(broken);
        return working.size() > MAX ? new ArrayList<>(working.subList(0, MAX)) : working;
    }

    static String label(Option o) { return o.down ? "✕ " + o.name + " — Not working, try another" : (o.sameEvent ? "▶ " : "⇄ ") + o.name; }
}
