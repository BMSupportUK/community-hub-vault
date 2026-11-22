package uk.bmsupport.player;

/** Premier League Hub channels split into one category per overseas broadcaster. */
public class HubSplitTest {
    private static void check(boolean ok, String label) { if (!ok) throw new AssertionError(label); System.out.println("ok - " + label); }
    public static void main(String[] args) {
        check("stan".equals(HubSplit.group("Stan Sport 34  (EPL ONLY)")), "stan sport goes to stan");
        check("starhub".equals(HubSplit.group("Star Hub Premier 9")), "star hub goes to star hub");
        check("fubo".equals(HubSplit.group("Fubo Sports | 03 |")), "fubo goes to fubo");
        check("plplus".equals(HubSplit.group("Premier League+ 4")), "premier league+ goes to its own");
        check("astro".equals(HubSplit.group("Astro Premier League 2")), "astro goes to astro");
        check("monomax".equals(HubSplit.group("Monomax 24/7")), "monomax gets its own");
        check("nowhk".equals(HubSplit.group("Now HK Sports 4K")) && "nowhk".equals(HubSplit.group("NowHK Sports 4K")), "now hk gets its own");
        check("flowsport".equals(HubSplit.group("Flowsport: 24/7")), "flowsport gets its own");
        check(HubSplit.isHub("EPL | Premier League Hub"), "hub category recognised");
        check(!HubSplit.isHub("UK | Sky Sports"), "other categories untouched");
        check(HubSplit.label("EPL | Premier League Hub", "stan").equals("EPL | Premier League Hub | Stan Sport"), "stan label");
        check(HubSplit.label("EPL | Premier League Hub", null).equals("EPL | Premier League Hub | Other"), "other label");
        check(HubSplit.parentId("77~fubo").equals("77"), "split id maps to provider id");
        check(HubSplit.parentId("77").equals("77"), "plain id unchanged");
        System.out.println("HubSplitTest: all passed");
    }
}
