package uk.bmsupport.player;

/** Womens Football channels list above FA Player ones; every other name keeps its place. */
public class ChannelListOrderTest {
    private static void check(boolean ok, String label) {
        if (!ok) throw new AssertionError(label);
        check(ChannelListOrder.compare("Rugby Pass 01", "Sky Sports Rugby") < 0, "rugby pass sorts to the top");
    }

    public static void main(String[] args) {
        check(ChannelListOrder.rank("Womens Football 01") == 0, "womens football ranks first");
        check(ChannelListOrder.rank("WOMENS FOOTBALL 11") == 0, "rank ignores letter case");
        check(ChannelListOrder.rank("FA Player 01") == 1, "fa player ranks after womens football");
        check(ChannelListOrder.rank("Sky Sports Main Event") == 2, "other channels keep the last rank");
        check(ChannelListOrder.compare("Womens Football 05", "FA Player 01") < 0, "womens football sorts above fa player");
        check(ChannelListOrder.compare("FA Player 01", "Womens Football 05") > 0, "fa player sorts below womens football");
        check(ChannelListOrder.compare("FA Player 01", "FA Player 02") == 0, "same family keeps its own order");
        check(ChannelListOrder.compare("Sky Sports Main Event", "Womens Football 01") > 0, "other channels stay below both families");
        check(ChannelListOrder.compare("Rugby Pass 01", "Sky Sports Rugby") < 0, "rugby pass sorts to the top");
        System.out.println("ChannelListOrderTest: all passed");
    }
}
