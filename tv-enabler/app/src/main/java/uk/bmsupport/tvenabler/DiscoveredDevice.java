package uk.bmsupport.tvenabler;

/** Discovery is read-only: only the address explicitly selected by the user is enabled. */
final class DiscoveredDevice {
    final String address;
    final String name;

    DiscoveredDevice(String address, String name) {
        this.address = address;
        this.name = name == null || name.trim().isEmpty() ? "TV — name unavailable" : name.trim();
    }

    String label() { return name + "\n" + address; }

    static DiscoveredDevice selected(java.util.List<DiscoveredDevice> devices, int index) {
        if (index < 0 || index >= devices.size()) throw new IllegalArgumentException("Select a TV first");
        return devices.get(index);
    }
}