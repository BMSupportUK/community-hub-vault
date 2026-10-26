package uk.bmsupport.tvenabler;

import java.util.HashSet;
import java.util.Set;

/** Exact package identities from the selected TV; app labels are never package names. */
final class InstalledApps {
    static boolean validPackage(String name) {
        return name != null && name.matches("[A-Za-z_][A-Za-z0-9_]*(\\.[A-Za-z_][A-Za-z0-9_]*)+");
    }
    static Set<String> from(String output) {
        Set<String> packages = new HashSet<>();
        for (String line : output.split("\\r?\\n")) {
            line = line.trim();
            if (line.startsWith("package:") && validPackage(line.substring(8))) packages.add(line.substring(8));
        }
        return packages;
    }
    static boolean contains(Set<String> packages, String name) {
        return validPackage(name) && packages.contains(name);
    }
}