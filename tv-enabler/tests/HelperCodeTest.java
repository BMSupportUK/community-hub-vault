package uk.bmsupport.tvenabler;
public final class HelperCodeTest {
    private static void check(boolean r, String rule) { if (!r) throw new AssertionError(rule); }
    public static void main(String[] a) {
        check("482913".equals(Enabler.helperCodeFrom("<node text=\"482 913\" package=\"uk.bmsupport.remote\" />")), "Reads spaced Helper code");
        check(Enabler.helperCodeFrom("<node text=\"482913\" package=\"com.amazon.tv.launcher\" />") == null, "Ignores other apps");
        check(Enabler.helperCodeFrom("<node text=\"12345\" package=\"uk.bmsupport.remote\" />") == null, "Needs six digits");
        System.out.println("HelperCodeTest passed");
    }
}
