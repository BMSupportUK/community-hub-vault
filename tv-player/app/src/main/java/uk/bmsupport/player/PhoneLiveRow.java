package uk.bmsupport.player;

import java.util.List;

/** Phone Live TV channel rows: what's on now, what's next and how far through "now" is. */
final class PhoneLiveRow {
    /** Virtual category id for the phone Favourites tab. */
    static final String FAVOURITES = "fav";
    private PhoneLiveRow() {}

    /** [now, next] from a channel's listings at time t (seconds); either may be null. */
    static GuideGridView.Prog[] nowNext(List<GuideGridView.Prog> l, long t) {
        GuideGridView.Prog now = null, next = null;
        if (l != null) for (GuideGridView.Prog p : l) {
            if (now == null && p.st <= t && p.en > t) now = p;
            else if (p.st > t && (next == null || p.st < next.st)) next = p;
        }
        return new GuideGridView.Prog[]{ now, next };
    }

    /** 0-100 through the programme, or -1 when it isn't on. */
    static int percent(GuideGridView.Prog p, long t) {
        if (p == null || p.en <= p.st || t < p.st || t >= p.en) return -1;
        return (int) ((t - p.st) * 100 / (p.en - p.st));
    }
}
