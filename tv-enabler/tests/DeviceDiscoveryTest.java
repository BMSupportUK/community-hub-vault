package uk.bmsupport.tvenabler;

import java.nio.charset.StandardCharsets;
import java.util.List;

public final class DeviceDiscoveryTest {
    private static void check(boolean value, String rule) {
        if (!value) throw new AssertionError(rule);
    }
    public static void main(String[] args) throws Exception {
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
        com.sun.net.httpserver.HttpServer tv = com.sun.net.httpserver.HttpServer.create(
                new java.net.InetSocketAddress("127.0.0.1", 8008), 0);
        tv.createContext("/ssdp/device-desc.xml", exchange -> {
            byte[] body = fireXml.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (java.io.OutputStream out = exchange.getResponseBody()) { out.write(body); }
        });
        tv.start();
        try {
            List<DiscoveredDevice> offResults = DeviceDiscovery.scan("127.0.0.");
            check(offResults.size() == 1 && "Living Room".equals(offResults.get(0).name)
                    && !offResults.get(0).debuggingReachable,
                    "Actual scan finds a named Fire TV without an open debugging port");
            try (java.net.ServerSocket adb = new java.net.ServerSocket(5555, 1, java.net.InetAddress.getByName("127.0.0.1"))) {
                List<DiscoveredDevice> onResults = DeviceDiscovery.scan("127.0.0.");
                check(onResults.size() == 1 && onResults.get(0).debuggingReachable,
                        "Actual scan marks the same TV reachable when debugging opens");
                adb.setSoTimeout(1000);
                try (java.net.Socket probe = adb.accept()) {
                    check(probe.getInputStream().read() == -1, "Discovery closes its TCP probe without sending ADB authentication");
                }
            }
        } finally { tv.stop(0); }
        com.sun.net.httpserver.HttpServer upnpTv = com.sun.net.httpserver.HttpServer.create(
                new java.net.InetSocketAddress("127.0.0.1", 50000), 0);
        upnpTv.createContext("/rootdesc.xml", exchange -> {
            byte[] body = fireXml.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (java.io.OutputStream out = exchange.getResponseBody()) { out.write(body); }
        });
        upnpTv.start();
        try {
            List<DiscoveredDevice> upnpResults = DeviceDiscovery.scan("127.0.0.");
            check(upnpResults.size() == 1 && "Living Room".equals(upnpResults.get(0).name),
                    "Scan finds a Fire TV that only advertises its UPnP description on port 50000");
        } finally { upnpTv.stop(0); }
        System.out.println("Device discovery: 18 checks passed");
    }
}