package uk.bmsupport.player;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.MulticastSocket;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Finds DLNA/UPnP smart TVs on the same Wi-Fi and tells one to play a stream (AVTransport). */
final class DlnaCast {
    static final String ST = "urn:schemas-upnp-org:service:AVTransport:1";

    static final class Tv {
        final String name, controlUrl;
        Tv(String name, String controlUrl) { this.name = name; this.controlUrl = controlUrl; }
    }

    private DlnaCast() {}

    /** Blocking: SSDP search for ~3 seconds, then read each device description. */
    static List<Tv> discover() {
        Set<String> locations = new LinkedHashSet<>();
        try (MulticastSocket s = new MulticastSocket()) {
            s.setSoTimeout(800);
            InetAddress group = InetAddress.getByName("239.255.255.250");
            String msg = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: " + ST + "\r\n\r\n";
            byte[] b = msg.getBytes("UTF-8");
            for (int i = 0; i < 2; i++) s.send(new DatagramPacket(b, b.length, group, 1900));
            long end = System.currentTimeMillis() + 3000;
            byte[] buf = new byte[4096];
            while (System.currentTimeMillis() < end) {
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                try { s.receive(p); } catch (SocketTimeoutException t) { continue; }
                String loc = header(new String(p.getData(), 0, p.getLength(), "UTF-8"), "LOCATION");
                if (loc != null) locations.add(loc.trim());
            }
        } catch (Exception ignored) {}
        List<Tv> out = new ArrayList<>();
        for (String loc : locations) {
            try { Tv tv = describe(loc, read(loc)); if (tv != null) out.add(tv); } catch (Exception ignored) {}
        }
        return out;
    }

    static String header(String response, String name) {
        for (String line : response.split("\r?\n")) {
            int c = line.indexOf(':');
            if (c > 0 && line.substring(0, c).trim().equalsIgnoreCase(name)) return line.substring(c + 1).trim();
        }
        return null;
    }

    /** Pull the friendly name and absolute AVTransport control URL out of a device description. */
    static Tv describe(String location, String xml) throws Exception {
        String name = tag(xml, "friendlyName");
        Matcher m = Pattern.compile("<service>(.*?)</service>", Pattern.DOTALL).matcher(xml);
        while (m.find()) {
            String svc = m.group(1);
            String type = tag(svc, "serviceType");
            if (type == null || !type.contains("AVTransport")) continue;
            String ctrl = tag(svc, "controlURL");
            if (ctrl == null) return null;
            String base = tag(xml, "URLBase");
            URL abs = new URL(new URL(base != null && !base.isEmpty() ? base : location), ctrl.trim());
            return new Tv(name == null || name.isEmpty() ? abs.getHost() : name.trim(), abs.toString());
        }
        return null;
    }

    private static String tag(String xml, String t) {
        Matcher m = Pattern.compile("<(?:\\w+:)?" + t + "[^>]*>(.*?)</(?:\\w+:)?" + t + ">", Pattern.DOTALL).matcher(xml);
        return m.find() ? m.group(1).trim() : null;
    }

    static String esc(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    /** Blocking: stop, load the URL and press play on the TV. */
    static void cast(Tv tv, String url, String title) throws Exception {
        try { soap(tv, "Stop", "<InstanceID>0</InstanceID>"); } catch (Exception ignored) {}
        String meta = "<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\">"
                + "<item id=\"0\" parentID=\"-1\" restricted=\"1\"><dc:title>" + esc(title) + "</dc:title>"
                + "<upnp:class>object.item.videoItem</upnp:class><res protocolInfo=\"http-get:*:video/*:*\">" + esc(url) + "</res></item></DIDL-Lite>";
        soap(tv, "SetAVTransportURI", "<InstanceID>0</InstanceID><CurrentURI>" + esc(url) + "</CurrentURI><CurrentURIMetaData>" + esc(meta) + "</CurrentURIMetaData>");
        soap(tv, "Play", "<InstanceID>0</InstanceID><Speed>1</Speed>");
    }

    static void stop(Tv tv) throws Exception { soap(tv, "Stop", "<InstanceID>0</InstanceID>"); }

    private static void soap(Tv tv, String action, String args) throws Exception {
        String body = "<?xml version=\"1.0\" encoding=\"utf-8\"?><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body>"
                + "<u:" + action + " xmlns:u=\"" + ST + "\">" + args + "</u:" + action + "></s:Body></s:Envelope>";
        HttpURLConnection c = (HttpURLConnection) new URL(tv.controlUrl).openConnection();
        c.setConnectTimeout(4000); c.setReadTimeout(8000);
        c.setRequestMethod("POST"); c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "text/xml; charset=\"utf-8\"");
        c.setRequestProperty("SOAPACTION", "\"" + ST + "#" + action + "\"");
        try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes("UTF-8")); }
        int code = c.getResponseCode();
        c.disconnect();
        if (code >= 300) throw new Exception("TV said " + code);
    }

    private static String read(String u) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
        c.setConnectTimeout(3000); c.setReadTimeout(4000);
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            return b.toString("UTF-8");
        } finally { c.disconnect(); }
    }
}
