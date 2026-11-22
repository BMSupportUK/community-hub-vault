package uk.bmsupport.player;

/** Womens Football channels list above FA Player ones; numbered families list 1 at the top. */
public class ChannelListOrderTest {
    private static void check(boolean ok, String label) {
        if (!ok) throw new AssertionError(label);
        System.out.println("ok - " + label);
    }

    public static void main(String[] args) {
        check(ChannelListOrder.rank("Womens Football 01") == 0, "womens football ranks first");
        check(ChannelListOrder.rank("WOMENS FOOTBALL 11") == 0, "rank ignores letter case");
        check(ChannelListOrder.rank("FA Player 01") == 1, "fa player ranks after womens football");
        check(ChannelListOrder.rank("Sky Sports Main Event") == 2, "other channels keep the last rank");
        check(ChannelListOrder.compare("Womens Football 05", "FA Player 01") < 0, "womens football sorts above fa player");
        check(ChannelListOrder.compare("FA Player 01", "Womens Football 05") > 0, "fa player sorts below womens football");
        check(ChannelListOrder.compare("Sky Sports Main Event", "Womens Football 01") > 0, "other channels stay below both families");
        check(ChannelListOrder.compare("Rugby Pass 01", "Sky Sports Rugby") < 0, "rugby pass sorts to the top");

        // Numbered families list ascending, 1 at the top, even when the provider sends them backwards.
        check(ChannelListOrder.compare("Tennis TV 01", "Tennis TV 02") < 0, "tennis tv 1 sorts above tennis tv 2");
        check(ChannelListOrder.compare("Tennis TV 10", "Tennis TV 02") > 0, "tennis tv 10 sorts below tennis tv 2");
        check(ChannelListOrder.compare("Tennis TV 03", "Tennis TV 03") == 0, "same tennis tv channel compares equal");
        check(ChannelListOrder.compare("FA Player 02", "FA Player 01") > 0, "fa player numbers list ascending too");
        check(ChannelListOrder.compare("Womens Football 11", "Womens Football 05") > 0, "womens football numbers list ascending");
        check(ChannelListOrder.compare("Tennis TV 01", "Sky Sports Main Event") == 0, "numbered vs unnumbered keeps provider order");
        check(ChannelListOrder.compare("Tennis TV 01", "Rugby Pass 01") > 0, "rugby pass family ranks above tennis tv");
        check(ChannelListOrder.compare("Tennis TV 01", "Sky Sports F1") == 0, "different plain families keep provider order");
        check(ChannelListOrder.compare("Tennis TV 1", "Tennis TV 01") == 0, "padded and plain numbers match");
        System.out.println("ChannelListOrderTest: all passed");
    }
}
