package uk.bmsupport.player;

/** Every overseas Premier League Hub broadcaster lands in its own Live TV list. */
public class HubSplitTest {
    private static void check(boolean ok, String label) {
        if (!ok) throw new AssertionError(label);
        System.out.println("ok - " + label);
    }

    public static void main(String[] args) {
        check("peacock".equals(HubSplit.group("Peacock Sports 2")), "peacock sports gets its own list");
        check("peacock".equals(HubSplit.group("EPL | Peacock 4")), "prefixed peacock name still matches");
        check("coupang".equals(HubSplit.group("EPL | Coupang Play 3")), "coupang play gets its own list");
        check("stan".equals(HubSplit.group("Stan Sport 34 (EPL ONLY)")), "stan sport still matches");
        check("fubo".equals(HubSplit.group("Fubo Sports | 03 |")), "fubo still matches");
        check(HubSplit.group("Mystery 1") == null, "unknown channel goes to other");
        System.out.println("HubSplitTest: all passed");
    }
}
