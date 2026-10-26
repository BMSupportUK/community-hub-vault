package uk.bmsupport.tvenabler;

public final class InstalledAppsTest {
    private static void check(boolean result, String rule) { if (!result) throw new AssertionError(rule); }
    public static void main(String[] args) {
        java.util.Set<String> apps = InstalledApps.from("package:uk.bmsupport.player\r\npackage:uk.bmsupport.player.pro\npackage:com.amazon.tv.launcher\n");
        check(InstalledApps.contains(apps, "uk.bmsupport.player"), "Existing app is bypassed regardless of its version");
        check(!InstalledApps.contains(apps, "uk.bmsupport.missing"), "Missing app is installed");
        check(!InstalledApps.contains(apps, "uk.bmsupport.play"), "Similar names must not count as installed");
        check(!InstalledApps.contains(apps, "Player") && !InstalledApps.validPackage("uk.app; reboot"), "Labels and shell injection cannot identify packages");
        check(!InstalledApps.contains(InstalledApps.from("Error: permission denied"), "uk.bmsupport.player"), "Failed inventory must not skip apps");
        System.out.println("InstalledAppsTest passed");
    }
}