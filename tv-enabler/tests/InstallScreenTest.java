package uk.bmsupport.tvenabler;

public final class InstallScreenTest {
    private static void check(boolean result, String rule) { if (!result) throw new AssertionError(rule); }
    public static void main(String[] args) {
        String base = "am start -n uk.bmsupport.installscreen/.MainActivity -f 0x20000000 --es state ";
        check(InstallScreen.command("installing", "Purple Player", 2, 4, null).equals(base + "installing --es app 'Purple Player' --ei index 2 --ei total 4"), "Installing shows app and count");
        check(InstallScreen.command("skipped", "IPTV Smarters", 1, 3, null).equals(base + "skipped --es app 'IPTV Smarters' --ei index 1 --ei total 3"), "Already-installed app sends skipped");
        check(InstallScreen.command("complete", null, 3, 3, java.util.Arrays.asList("A", "B")).equals(base + "complete --ei index 3 --ei total 3 --es apps 'A|B'"), "Complete lists the apps");
        check(InstallScreen.command("error", null, 0, 0, null).equals(base + "error --ei index 0 --ei total 0"), "Error state");
        check(InstallScreen.command("reboot", null, 0, 0, null).contains("--es state error"), "Unknown states become error");
        check(!InstallScreen.command("installing", "x'; reboot; '", 1, 1, null).contains(";"), "App names cannot inject shell commands");
        System.out.println("InstallScreenTest passed");
    }
}
