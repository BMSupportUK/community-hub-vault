package uk.bmsupport.tvenabler;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.NodeList;

/** Finds Amazon Fire TVs through local DIAL/UPnP independently of debugging status.
 * Never authenticates with ADB, installs anything, or changes a TV during discovery. */
final class DeviceDiscovery {
    /** Fire TV models advertise their description on different ports/paths:
     * Sticks use DIAL on 8008, Cubes and Fire TVs use UPnP on 50000. Try them all. */
    private static final String[] FALLBACK_PATHS = {
            "http://%s:8008/ssdp/device-desc.xml",
            "http://%s:8008/dd.xml",
            "http://%s:50000/rootdesc.xml",
            "http://%s:50000/description.xml",
    };

    static List<DiscoveredDevice> scan(String base) throws InterruptedException { return scan(base, false); }

    /** android=false lists only Fire TVs; android=true lists TV-like devices that aren't Amazon
     * (Cast/DIAL TVs, or anything with network debugging open). */
    static List<DiscoveredDevice> scan(String base, boolean android) throws InterruptedException {
        Advertised advertised = advertisedLocations(base);
        Map<String, DiscoveredDevice> found = new ConcurrentHashMap<>();
        ExecutorService pool = Executors.newFixedThreadPool(48);
        try {
            for (int i = 1; i < 255; i++) {
                String host = base + i;
                pool.execute(() -> {
                    Description description = null;
                    String location = advertised.locations.get(host);
                    if (location != null) description = readDescription(host, location);
                    if (description == null) {
                        for (String path : FALLBACK_PATHS) {
                            Description d = readDescription(host, String.format(path, host));
                            if (d != null) description = d;
                            if (d != null && (d.fireTv || d.amazon || d.cast)) break;
                        }
                    }
                    boolean amazon = advertised.fireTvHints.containsKey(host)
                            || (description != null && (description.fireTv || description.amazon));
                    String name = description == null ? null : description.name;
                    if (android) {
                        if (amazon) return;
                        boolean reachable = debuggingReachable(host);
                        if (!reachable && !(description != null && description.cast) && !advertised.dialHints.containsKey(host)) return;
                        found.put(host, new DiscoveredDevice(host, name == null ? "Android / Google TV — name unavailable" : name, reachable));
                        return;
                    }
                    // Amazon maker or Fire TV hint is enough; a silent box with debugging open is listed too,
                    // because many Fire TVs don't answer DIAL/UPnP. Known non-Amazon devices stay out.
                    if (!amazon) {
                        boolean knownOther = (description != null) || advertised.dialHints.containsKey(host);
                        if (knownOther || !debuggingReachable(host)) return;
                        found.put(host, new DiscoveredDevice(host, "Fire TV — name unavailable", true));
                        return;
                    }
                    boolean reachable = debuggingReachable(host);
                    found.put(host, new DiscoveredDevice(host, name, reachable));
                });
            }
            pool.shutdown();
            if (!pool.awaitTermination(60, TimeUnit.SECONDS)) pool.shutdownNow();
            List<DiscoveredDevice> devices = new ArrayList<>(found.values());
            devices.sort((a, b) -> {
                int byName = a.name.compareToIgnoreCase(b.name);
                return byName != 0 ? byName : Integer.compare(lastOctet(a.address), lastOctet(b.address));
            });
            return devices;
        } finally { pool.shutdownNow(); }
    }

    private static int lastOctet(String host) { return Integer.parseInt(host.substring(host.lastIndexOf('.') + 1)); }

    private static final class Advertised {
        final Map<String, String> locations = new HashMap<>();
        final Map<String, Boolean> fireTvHints = new HashMap<>();
        final Map<String, Boolean> dialHints = new HashMap<>();
    }

    private static Advertised advertisedLocations(String base) {
        Advertised advertised = new Advertised();
        try (DatagramSocket socket = new DatagramSocket()) {
            socket.setSoTimeout(400);
            // Ask twice: once for everything, once for the DIAL service Fire TVs answer to.
            for (String st : new String[] {"ssdp:all", "urn:dial-multiscreen-org:service:dial:1"}) {
                String request = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: " + st + "\r\n\r\n";
                byte[] bytes = request.getBytes(StandardCharsets.UTF_8);
                socket.send(new DatagramPacket(bytes, bytes.length, InetAddress.getByName("239.255.255.250"), 1900));
            }
            long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(4);
            while (System.nanoTime() < end) {
                byte[] buffer = new byte[8192];
                DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                try { socket.receive(packet); } catch (java.net.SocketTimeoutException ignored) { continue; }
                String host = packet.getAddress().getHostAddress();
                if (!host.startsWith(base)) continue;
                String response = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8);
                String lower = response.toLowerCase(java.util.Locale.ROOT);
                // A Fire TV answers with its own server banner even when its description can't be fetched.
                if (lower.contains("amazon") || lower.contains("aft")) advertised.fireTvHints.put(host, Boolean.TRUE);
                else if (lower.contains("dial") || lower.contains("google") || lower.contains("android")) advertised.dialHints.put(host, Boolean.TRUE);
                for (String line : response.split("\r?\n")) {
                    if (line.regionMatches(true, 0, "location:", 0, 9)) {
                        String location = line.substring(9).trim();
                        if (safeLocation(host, location)) advertised.locations.put(host, location);
                    }
                }
            }
        } catch (Exception ignored) { /* Manual address entry remains available. */ }
        return advertised;
    }

    static boolean safeLocation(String host, String location) {
        try {
            URL url = new URL(location);
            return "http".equals(url.getProtocol()) && host.equals(url.getHost()) && url.getUserInfo() == null;
        } catch (Exception ignored) { return false; }
    }

    static String readName(String host, String location) {
        Description description = readDescription(host, location);
        return description == null ? null : description.name;
    }

    private static boolean debuggingReachable(String host) {
        // Only a TCP reachability check: never send an ADB handshake or an enable command.
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, 5555), 600);
            return true;
        } catch (Exception ignored) { return false; }
    }

    static Description readDescription(String host, String location) {
        if (!safeLocation(host, location)) return null;
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(location).openConnection();
            connection.setConnectTimeout(1500);
            connection.setReadTimeout(1500);
            connection.setInstanceFollowRedirects(false);
            if (connection.getResponseCode() != 200) return null;
            byte[] xml;
            try (java.io.InputStream in = connection.getInputStream();
                 java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
                byte[] buffer = new byte[1024];
                int n;
                while ((n = in.read(buffer)) != -1) {
                    if (out.size() + n > 65536) return null;
                    out.write(buffer, 0, n);
                }
                xml = out.toByteArray();
            }
            Description d = parseDescription(xml);
            return d == null ? null : new Description(d.name, d.fireTv, d.amazon, new URL(location).getPort() == 8008);
        } catch (Exception ignored) { return null; }
        finally { if (connection != null) connection.disconnect(); }
    }

    static String parseName(byte[] xml) {
        Description description = parseDescription(xml);
        return description == null ? null : description.name;
    }

    static final class Description {
        final String name;
        final boolean fireTv, amazon, cast;
        Description(String name, boolean fireTv) { this(name, fireTv, fireTv, false); }
        Description(String name, boolean fireTv, boolean amazon, boolean cast) { this.name = name; this.fireTv = fireTv; this.amazon = amazon; this.cast = cast; }
    }

    static Description parseDescription(byte[] xml) {
        try {
            // Reject declarations that could read external files or expand entities.
            String raw = new String(xml, StandardCharsets.UTF_8);
            if (raw.toUpperCase(java.util.Locale.ROOT).contains("<!DOCTYPE") || raw.toUpperCase(java.util.Locale.ROOT).contains("<!ENTITY")) return null;
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setExpandEntityReferences(false);
            javax.xml.parsers.DocumentBuilder builder = factory.newDocumentBuilder();
            builder.setEntityResolver((publicId, systemId) -> new org.xml.sax.InputSource(new java.io.StringReader("")));
            org.w3c.dom.Document doc = builder.parse(new java.io.ByteArrayInputStream(xml));
            NodeList devices = doc.getElementsByTagNameNS("*", "device");
            Description fallback = null;
            for (int i = 0; i < devices.getLength(); i++) {
                org.w3c.dom.Node device = devices.item(i);
                String name = childText(device, "friendlyName");
                String manufacturer = childText(device, "manufacturer").toLowerCase(java.util.Locale.ROOT);
                String model = (childText(device, "modelName") + " " + childText(device, "modelDescription"))
                        .toLowerCase(java.util.Locale.ROOT);
                boolean fireTv = manufacturer.contains("amazon") &&
                        (model.contains("fire tv") || model.contains("firetv") || model.matches(".*\\baft[a-z0-9]+\\b.*"));
                Description result = new Description(name.isEmpty() ? null : name, fireTv, manufacturer.contains("amazon"), false);
                if (fireTv) return result;
                if (fallback == null) fallback = result;
            }
            return fallback;
        } catch (Exception ignored) { return null; }
    }

    private static String childText(org.w3c.dom.Node device, String tag) {
        for (org.w3c.dom.Node node = device.getFirstChild(); node != null; node = node.getNextSibling()) {
            if (tag.equals(node.getLocalName()) || tag.equals(node.getNodeName())) {
                String value = node.getTextContent().replaceAll("[\\p{Cntrl}]", " ").trim();
                return value.substring(0, Math.min(100, value.length()));
            }
        }
        return "";
    }
}
