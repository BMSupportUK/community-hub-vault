package uk.bmsupport.player;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Tiny HTTP helper (runs on a background thread). */
final class Net {
    static final String SITE = "https://bmsupport.uk";

    interface Progress { void bytes(long n); }

    static String get(String url) throws Exception { return send("GET", url, null, null); }

    /** GET that reports bytes downloaded so far (about every 256 KB). */
    static String get(String url, Progress p) throws Exception { return send("GET", url, null, p); }

    static String postJson(String url, String body) throws Exception { return send("POST", url, body, null); }

    private static String send(String method, String url, String body, Progress p) throws Exception {
        URL u = new URL(url);
        String hostHeader = null;
        // Private DNS for provider lists (plain http only; https needs the real name for its certificate).
        if (PrivateDns.enabled && !url.startsWith(SITE) && "http".equals(u.getProtocol())) {
            String ip = PrivateDns.resolve(u.getHost());
            if (ip != null) { hostHeader = u.getPort() > 0 ? u.getHost() + ":" + u.getPort() : u.getHost();
                PrivateDns.listUsed = true;
                u = new URL("http", ip, u.getPort(), u.getFile()); }
        }
        HttpURLConnection c = (HttpURLConnection) u.openConnection();
        c.setRequestMethod(method);
        if (hostHeader != null) { c.setInstanceFollowRedirects(true); c.setRequestProperty("Host", hostHeader); }
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "BMPlayer/1.0");
        if (body != null) {
            c.setDoOutput(true);
            c.setRequestProperty("content-type", "application/json");
            try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
        }
        boolean site = url.startsWith(SITE);
        int code;
        try { code = c.getResponseCode(); } catch (java.io.IOException e) { if (site) Checkin.fail(0); throw e; }
        if (site) { if (code == 429 || code >= 500) Checkin.fail(Checkin.retryAfterMs(c.getHeaderField("Retry-After"))); else Checkin.ok(); }
        InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        if (in != null) { byte[] buf = new byte[16384]; int n; long total = 0, next = 262144;
            while ((n = in.read(buf)) > 0) { b.write(buf, 0, n); total += n; if (p != null && total >= next) { p.bytes(total); next = total + 262144; } }
            in.close(); }
        String s = b.toString("UTF-8");
        if (code >= 400) throw new Exception("HTTP " + code + ": " + s);
        return s;
    }
}
