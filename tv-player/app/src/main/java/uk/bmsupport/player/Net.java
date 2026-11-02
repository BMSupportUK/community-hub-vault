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

    static String get(String url) throws Exception { return send("GET", url, null); }

    static String postJson(String url, String body) throws Exception { return send("POST", url, body); }

    private static String send(String method, String url, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "BMPlayer/1.0");
        if (body != null) {
            c.setDoOutput(true);
            c.setRequestProperty("content-type", "application/json");
            try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
        }
        int code = c.getResponseCode();
        InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        if (in != null) { byte[] buf = new byte[16384]; int n; while ((n = in.read(buf)) > 0) b.write(buf, 0, n); in.close(); }
        String s = b.toString("UTF-8");
        if (code >= 400) throw new Exception("HTTP " + code + ": " + s);
        return s;
    }
}
