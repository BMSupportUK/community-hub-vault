package uk.bmsupport.player;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Private DNS: looks up provider server names over encrypted DNS (Cloudflare, then Google)
 * so the broadband provider can't see or block them. Does not hide the IP address.
 * Any failure returns null and the caller uses the box's normal DNS.
 */
final class PrivateDns {
    static final String PREF = "private_dns";
    static final List<String> SERVERS = Arrays.asList(
            "https://1.1.1.1/dns-query?type=A&name=",
            "https://8.8.8.8/resolve?type=A&name=");
    static final int TIMEOUT_MS = 3000;
    static volatile boolean enabled = true;

    /** True once a provider-list lookup went through Private DNS; reset when the switch changes. */
    static volatile boolean listUsed;

    interface Fetcher { String fetch(String url, int timeoutMs) throws Exception; }
    static Fetcher fetcher = PrivateDns::httpGet;

    private static final Map<String, long[]> cache = new ConcurrentHashMap<>();
    private static final Map<String, String> ips = new ConcurrentHashMap<>();
    private static final Pattern IP = Pattern.compile("\"type\"\\s*:\\s*1\\s*,[^}]*?\"data\"\\s*:\\s*\"(\\d{1,3}(?:\\.\\d{1,3}){3})\"|\"data\"\\s*:\\s*\"(\\d{1,3}(?:\\.\\d{1,3}){3})\"");

    /** Resolved IPv4 for host, or null to fall back to normal DNS. */
    static String resolve(String host) {
        if (host == null || host.isEmpty() || host.matches("[\\d.]+") || host.contains(":")) return null;
        long now = System.currentTimeMillis();
        long[] exp = cache.get(host);
        if (exp != null && exp[0] > now) return ips.get(host);
        for (String s : SERVERS) {
            try {
                String ip = parse(fetcher.fetch(s + host, TIMEOUT_MS));
                if (ip != null) { ips.put(host, ip); cache.put(host, new long[]{now + 300_000}); return ip; }
            } catch (Exception ignored) { }
        }
        return null;
    }

    static String parse(String json) {
        if (json == null || !json.contains("\"Status\":0")) return null;
        Matcher m = IP.matcher(json);
        while (m.find()) { String ip = m.group(1) != null ? m.group(1) : m.group(2); if (ip != null) return ip; }
        return null;
    }

    /** Home-screen label: the VPN covers lookups while it is connected. */
    static String homeLabel(boolean on, boolean viaVpn) { return viaVpn ? "via VPN" : on ? "On" : "Off"; }

    static void clear() { cache.clear(); ips.clear(); listUsed = false; }

    private static String httpGet(String url, int timeoutMs) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(timeoutMs); c.setReadTimeout(timeoutMs);
        c.setRequestProperty("accept", "application/dns-json");
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[4096]; int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            return b.toString("UTF-8");
        } finally { c.disconnect(); }
    }
}
