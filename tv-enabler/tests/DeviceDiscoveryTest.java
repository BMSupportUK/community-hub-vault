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
        String fireXml = "<root><device><friendlyName>Living Room</friendlyName><manufacturer>Amazon</manufacturer><modelName>AFTMM</modelName></device></root>";
        DeviceDiscovery.Description fire = DeviceDiscovery.parseDescription(fireXml.getBytes(StandardCharsets.UTF_8));
        check(fire != null && fire.fireTv && "Living Room".equals(fire.name), "Identify Amazon Fire TV by model, not its chosen name");
        DeviceDiscovery.Description google = DeviceDiscovery.parseDescription(fireXml.replace("Amazon", "Google").getBytes(StandardCharsets.UTF_8));
        check(google != null && !google.fireTv, "Do not list Google devices");
        DeviceDiscovery.Description tablet = DeviceDiscovery.parseDescription(fireXml.replace("AFTMM", "Fire HD 10").getBytes(StandardCharsets.UTF_8));
        check(tablet != null && !tablet.fireTv, "Do not list Amazon tablets");
        DiscoveredDevice off = new DiscoveredDevice("192.168.1.24", "Bedroom Fire TV", false);
        check(!off.debuggingReachable, "Retain Fire TVs with debugging unreachable");
        check(DiscoveredDevice.selected(List.of(devices.get(0), off), 1) == off, "Allow explicitly selecting a Fire TV with debugging unreachable");
        DeviceDiscovery.Description namedFire = DeviceDiscovery.parseDescription(fireXml.replace("AFTMM", "Fire TV Stick 4K").getBytes(StandardCharsets.UTF_8));
        check(namedFire != null && namedFire.fireTv, "Recognize full Fire TV model names");
        System.out.println("Device discovery: 14 checks passed");
    }
}