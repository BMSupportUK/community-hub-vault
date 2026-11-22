package uk.bmsupport.player;

import java.util.ArrayList;
import java.util.List;

/** Going back into a section reopens the category list on the category you were in. */
public class CategoryMemoryTest {
    private static void check(boolean ok, String label) { if (!ok) throw new AssertionError(label); System.out.println("ok - " + label); }

    private static List<String[]> rows(String... ids) {
        List<String[]> out = new ArrayList<>();
        for (String id : ids) out.add(new String[]{id, "name-" + id});
        return out;
    }

    public static void main(String[] args) {
        CategoryMemory m = new CategoryMemory();
        List<String[]> cats = rows("*", "12", "34", "56");

        check(m.restoreIndex("film", cats) == 0, "nothing saved starts at the top");

        m.save("film", "34");
        check(m.restoreIndex("film", cats) == 2, "saved film category restores its row");
        check(m.restoreIndex("series", cats) == 0, "other sections still start at the top");

        m.save("series", "56");
        check(m.restoreIndex("series", cats) == 3, "series remembers its own category");
        check(m.restoreIndex("film", cats) == 2, "saving series does not move films");

        m.save("film", "99");
        check(m.restoreIndex("film", cats) == 0, "a category that vanished falls back to the top");

        m.save("film", "*");
        check(m.restoreIndex("film", cats) == 0, "All restores to the top row");

        check(CategoryMemory.indexOf(cats, "34") == 2, "indexOf finds the row");
        check(CategoryMemory.indexOf(cats, "99") == -1, "indexOf misses unknown ids");
        check(CategoryMemory.indexOf(cats, null) == -1, "indexOf tolerates null");

        System.out.println("CategoryMemoryTest: all passed");
    }
}
