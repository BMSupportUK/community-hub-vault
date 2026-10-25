package uk.bmsupport.app.tvremote;

/** Discovery is read-only: only the address explicitly selected by the user is enabled. */
final class DiscoveredDevice {
    final String address;
    final String name;
    final boolean debuggingReachable;

    DiscoveredDevice(String address, String name) {
        this(address, name, true);
    }

    DiscoveredDevice(String address, String name, boolean debuggingReachable) {
        this.address = address;
        this.name = name == null || name.trim().isEmpty() ? "Fire TV — name unavailable" : name.trim();
        this.debuggingReachable = debuggingReachable;
    }

    String label() { return name + "\n" + address + "\n" +
            (debuggingReachable ? "ADB debugging reachable" : "ADB debugging not reachable — may be off"); }

    static DiscoveredDevice selected(java.util.List<DiscoveredDevice> devices, int index) {
        if (index < 0 || index >= devices.size()) throw new IllegalArgumentException("Select a TV first");
        return devices.get(index);
    }
}