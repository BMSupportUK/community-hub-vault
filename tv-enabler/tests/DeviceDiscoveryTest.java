package uk.bmsupport.tvenabler;

import java.nio.charset.StandardCharsets;
import java.util.List;

public final class DeviceDiscoveryTest {
    private static void check(boolean value, String rule) {
        if (!value) throw new AssertionError(rule);
    }
    public static void main(String[] args) {
        List<DiscoveredDevice> devices = List.of(
                new DiscoveredDevice("192.168.1.23", "Living Room Fire TV"),
                new DiscoveredDevice("192.168.1.24", "Bedroom Fire TV"));
        check(DiscoveredDevice.selected(devices, 1).address.equals("192.168.1.24"), "Choose the selected TV, never the first result");
        check(devices.size() == 2, "Retain all discovered devices");
        try {
            DiscoveredDevice.selected(devices, -1);
            throw new AssertionError("Must require explicit selection");
        } catch (IllegalArgumentException expected) { }
        String xml = "<root xmlns='urn:schemas-upnp-org:device-1-0'><device><friendlyName>Bedroom Fire TV</friendlyName></device></root>";
        check("Bedroom Fire TV".equals(DeviceDiscovery.parseName(xml.getBytes(StandardCharsets.UTF_8))), "Read the advertised device name");
        check(DeviceDiscovery.parseName("<!DOCTYPE root [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><root/>".getBytes(StandardCharsets.UTF_8)) == null, "Reject external entities");
        check(DeviceDiscovery.safeLocation("192.168.1.24", "http://192.168.1.24:8008/description.xml"), "Allow a device's own local description");
        check(!DeviceDiscovery.safeLocation("192.168.1.24", "http://example.com/description.xml"), "Never follow names to another host");
        check(new DiscoveredDevice("192.168.1.25", null).address.equals("192.168.1.25"), "Keep selectable addresses when names are unavailable");
        System.out.println("Device discovery: 8 checks passed");
    }
}