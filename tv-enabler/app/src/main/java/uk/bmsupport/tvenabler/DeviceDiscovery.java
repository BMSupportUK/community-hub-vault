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

/** Finds debugging-enabled devices and reads names advertised through local DIAL/UPnP.
 * Never authenticates with ADB, installs anything, or changes a TV during discovery. */
final class DeviceDiscovery {
    static List<DiscoveredDevice> scan(String base) throws InterruptedException {
        Map<String, String> locations = advertisedLocations(base);
        Map<String, DiscoveredDevice> found = new ConcurrentHashMap<>();
        ExecutorService pool = Executors.newFixedThreadPool(32);
        try {
            for (int i = 1; i < 255; i++) {
                String host = base + i;
                pool.execute(() -> {
                    try (Socket socket = new Socket()) {
                        socket.connect(new InetSocketAddress(host, 5555), 400);
                    } catch (Exception ignored) { return; }
                    String location = locations.get(host);
                    String name = readName(host, location == null
                            ? "http://" + host + ":8008/ssdp/device-desc.xml" : location);
                    found.put(host, new DiscoveredDevice(host, name));
                });
            }
            pool.shutdown();
            if (!pool.awaitTermination(30, TimeUnit.SECONDS)) pool.shutdownNow();
            List<DiscoveredDevice> devices = new ArrayList<>(found.values());
            devices.sort((a, b) -> {
                int byName = a.name.compareToIgnoreCase(b.name);
                return byName != 0 ? byName : Integer.compare(lastOctet(a.address), lastOctet(b.address));
            });
            return devices;
        } finally { pool.shutdownNow(); }
    }

    private static int lastOctet(String host) { return Integer.parseInt(host.substring(host.lastIndexOf('.') + 1)); }

    private static Map<String, String> advertisedLocations(String base) {
        Map<String, String> locations = new HashMap<>();
        try (DatagramSocket socket = new DatagramSocket()) {
            socket.setSoTimeout(500);
            String request = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 1\r\nST: ssdp:all\r\n\r\n";
            byte[] bytes = request.getBytes(StandardCharsets.UTF_8);
            socket.send(new DatagramPacket(bytes, bytes.length, InetAddress.getByName("239.255.255.250"), 1900));
            long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            while (System.nanoTime() < end) {
                byte[] buffer = new byte[8192];
                DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                try { socket.receive(packet); } catch (java.net.SocketTimeoutException ignored) { continue; }
                String host = packet.getAddress().getHostAddress();
                if (!host.startsWith(base)) continue;
                String response = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8);
                for (String line : response.split("\r?\n")) {
                    if (line.regionMatches(true, 0, "location:", 0, 9)) {
                        String location = line.substring(9).trim();
                        if (safeLocation(host, location)) locations.put(host, location);
                    }
                }
            }
        } catch (Exception ignored) { /* Manual address entry remains available. */ }
        return locations;
    }

    static boolean safeLocation(String host, String location) {
        try {
            URL url = new URL(location);
            return "http".equals(url.getProtocol()) && host.equals(url.getHost()) && url.getUserInfo() == null;
        } catch (Exception ignored) { return false; }
    }

    static String readName(String host, String location) {
        if (!safeLocation(host, location)) return null;
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(location).openConnection();
            connection.setConnectTimeout(700);
            connection.setReadTimeout(700);
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
            return parseName(xml);
        } catch (Exception ignored) { return null; }
        finally { if (connection != null) connection.disconnect(); }
    }

    static String parseName(byte[] xml) {
        try {
            // Reject declarations that could read external files or expand entities.
            String raw = new String(xml, StandardCharsets.UTF_8);
            if (raw.toUpperCase(java.util.Locale.ROOT).contains("<!DOCTYPE") || raw.toUpperCase(java.util.Locale.ROOT).contains("<!ENTITY")) return null;
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setExpandEntityReferences(false);
            javax.xml.parsers.DocumentBuilder builder = factory.newDocumentBuilder();
            builder.setEntityResolver((publicId, systemId) -> new org.xml.sax.InputSource(new java.io.StringReader("")));
            NodeList names = builder.parse(new java.io.ByteArrayInputStream(xml)).getElementsByTagNameNS("*", "friendlyName");
            if (names.getLength() == 0) return null;
            String name = names.item(0).getTextContent().replaceAll("[\\p{Cntrl}]", " ").trim();
            return name.isEmpty() ? null : name.substring(0, Math.min(100, name.length()));
        } catch (Exception ignored) { return null; }
    }
}