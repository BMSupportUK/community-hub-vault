package uk.bmsupport.app.localsend;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.util.Base64;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.InetAddress;
import java.net.MulticastSocket;
import java.net.ServerSocket;
import java.net.Socket;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Makes the BM Support app itself a LocalSend receiver, so a phone (or the
 * app on another device) can push an APK to a Fire Stick / Android box that has
 * BM Support installed — no separate LocalSend app needed on the TV.
 *
 * Runs a tiny HTTP server on 53317 implementing the LocalSend v2 receive API and
 * answers multicast announcements so senders discover the TV. Completed APK
 * transfers are handed straight to the Android package installer.
 */
public class LocalSendReceiver {

    public interface Events {
        void onEvent(String phase, String fileName, int percent, String error);
    }

    private static final int PORT = 53317;
    private static final String MULTICAST_GROUP = "224.0.0.167";

    private final Context context;
    private final Events events;
    private final String alias;
    private final String fingerprint;

    private final ExecutorService pool = Executors.newCachedThreadPool();
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final Map<String, PendingFile> pending = new HashMap<String, PendingFile>();

    private ServerSocket server;
    private MulticastSocket multicast;
    private WifiManager.MulticastLock lock;

    private static class PendingFile {
        String sessionId;
        String token;
        String fileName;
        long size;
    }

    LocalSendReceiver(Context context, String alias, Events events) {
        this.context = context.getApplicationContext();
        this.alias = alias;
        this.events = events;
        byte[] rnd = new byte[16];
        new SecureRandom().nextBytes(rnd);
        this.fingerprint = Base64.encodeToString(rnd, Base64.NO_WRAP)
                .replaceAll("[^A-Za-z0-9]", "");
    }

    boolean isRunning() {
        return running.get();
    }

    synchronized void start() throws Exception {
        if (running.get()) return;
        server = new ServerSocket();
        server.setReuseAddress(true);
        server.bind(new java.net.InetSocketAddress(PORT));
        running.set(true);
        pool.execute(new Runnable() {
            public void run() {
                acceptLoop();
            }
        });
        pool.execute(new Runnable() {
            public void run() {
                multicastLoop();
            }
        });
        emit("listening", null, 0, null);
    }

    synchronized void stop() {
        running.set(false);
        closeQuietly(server);
        if (multicast != null) {
            try {
                multicast.close();
            } catch (Exception ignored) {
            }
        }
        if (lock != null && lock.isHeld()) lock.release();
        emit("stopped", null, 0, null);
    }

    // ------------------------------------------------------------ discovery

    private JSONObject selfInfo(boolean announce) throws Exception {
        JSONObject o = new JSONObject();
        o.put("alias", alias);
        o.put("version", "2.0");
        o.put("deviceModel", Build.MODEL);
        o.put("deviceType", isTv() ? "tv" : "mobile");
        o.put("fingerprint", fingerprint);
        o.put("port", PORT);
        o.put("protocol", "http");
        o.put("download", false);
        o.put("announce", announce);
        return o;
    }

    private boolean isTv() {
        try {
            android.app.UiModeManager ui = (android.app.UiModeManager)
                    context.getSystemService(Context.UI_MODE_SERVICE);
            return ui != null
                    && ui.getCurrentModeType() == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION;
        } catch (Exception e) {
            return false;
        }
    }

    private void multicastLoop() {
        try {
            WifiManager wm = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                lock = wm.createMulticastLock("bm-localsend-receive");
                lock.setReferenceCounted(true);
                lock.acquire();
            }
            multicast = new MulticastSocket(null);
            multicast.setReuseAddress(true);
            multicast.bind(new java.net.InetSocketAddress(PORT));
            InetAddress group = InetAddress.getByName(MULTICAST_GROUP);
            try {
                multicast.joinGroup(group);
            } catch (Exception ignored) {
            }
            // Announce ourselves once so senders already scanning see us.
            byte[] hello = selfInfo(true).toString().getBytes("UTF-8");
            try {
                multicast.send(new DatagramPacket(hello, hello.length, group, PORT));
            } catch (Exception ignored) {
            }

            while (running.get()) {
                byte[] buf = new byte[8192];
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                multicast.receive(p);
                try {
                    JSONObject info = new JSONObject(
                            new String(p.getData(), 0, p.getLength(), "UTF-8"));
                    if (fingerprint.equals(info.optString("fingerprint"))) continue;
                    if (!info.optBoolean("announce", false)) continue;
                    byte[] reply = selfInfo(false).toString().getBytes("UTF-8");
                    multicast.send(new DatagramPacket(reply, reply.length, p.getAddress(), PORT));
                } catch (Exception ignored) {
                }
            }
        } catch (Exception ignored) {
        }
    }

    // ----------------------------------------------------------- http server

    private void acceptLoop() {
        while (running.get()) {
            try {
                final Socket client = server.accept();
                pool.execute(new Runnable() {
                    public void run() {
                        handle(client);
                    }
                });
            } catch (Exception e) {
                if (!running.get()) return;
            }
        }
    }

    private void handle(Socket client) {
        try {
            client.setSoTimeout(600000);
            InputStream in = client.getInputStream();
            OutputStream out = new BufferedOutputStream(client.getOutputStream());

            String requestLine = readLine(in);
            if (requestLine == null) {
                closeQuietly(client);
                return;
            }
            String[] parts = requestLine.split(" ");
            String method = parts.length > 0 ? parts[0] : "GET";
            String target = parts.length > 1 ? parts[1] : "/";

            long contentLength = 0;
            String line;
            while ((line = readLine(in)) != null && line.length() > 0) {
                int colon = line.indexOf(':');
                if (colon <= 0) continue;
                String name = line.substring(0, colon).trim().toLowerCase();
                String value = line.substring(colon + 1).trim();
                if ("content-length".equals(name)) {
                    try {
                        contentLength = Long.parseLong(value);
                    } catch (Exception ignored) {
                    }
                }
            }

            String path = target;
            Map<String, String> query = new HashMap<String, String>();
            int q = target.indexOf('?');
            if (q >= 0) {
                path = target.substring(0, q);
                for (String pair : target.substring(q + 1).split("&")) {
                    int eq = pair.indexOf('=');
                    if (eq > 0) {
                        query.put(decode(pair.substring(0, eq)), decode(pair.substring(eq + 1)));
                    }
                }
            }

            if (path.endsWith("/info") && "GET".equals(method)) {
                respond(out, 200, selfInfo(false).toString());
            } else if (path.endsWith("/register")) {
                readBody(in, contentLength);
                respond(out, 200, selfInfo(false).toString());
            } else if (path.endsWith("/prepare-upload")) {
                String body = new String(readBody(in, contentLength), "UTF-8");
                respond(out, 200, preparePayload(body));
            } else if (path.endsWith("/upload")) {
                boolean ok = receiveUpload(in, contentLength, query);
                respond(out, ok ? 200 : 403, "{}");
            } else if (path.endsWith("/cancel")) {
                synchronized (pending) {
                    pending.clear();
                }
                emit("cancelled", null, 0, null);
                respond(out, 200, "{}");
            } else {
                readBody(in, contentLength);
                respond(out, 404, "{}");
            }
            out.flush();
        } catch (Exception ignored) {
        } finally {
            closeQuietly(client);
        }
    }

    private String preparePayload(String body) throws Exception {
        JSONObject req = new JSONObject(body);
        JSONObject files = req.optJSONObject("files");
        String sessionId = "bm-" + System.currentTimeMillis();
        JSONObject tokens = new JSONObject();
        String firstName = null;
        if (files != null) {
            java.util.Iterator<String> keys = files.keys();
            while (keys.hasNext()) {
                String id = keys.next();
                JSONObject f = files.optJSONObject(id);
                PendingFile pf = new PendingFile();
                pf.sessionId = sessionId;
                pf.token = "t-" + Math.abs(new SecureRandom().nextLong());
                pf.fileName = f == null ? id : f.optString("fileName", id);
                pf.size = f == null ? 0 : f.optLong("size", 0);
                synchronized (pending) {
                    pending.put(id, pf);
                }
                tokens.put(id, pf.token);
                if (firstName == null) firstName = pf.fileName;
            }
        }
        JSONObject res = new JSONObject();
        res.put("sessionId", sessionId);
        res.put("files", tokens);
        emit("incoming", firstName, 0, null);
        return res.toString();
    }

    private boolean receiveUpload(InputStream in, long contentLength, Map<String, String> query) {
        String fileId = query.get("fileId");
        String token = query.get("token");
        PendingFile pf;
        synchronized (pending) {
            pf = fileId == null ? null : pending.get(fileId);
        }
        if (pf == null || token == null || !token.equals(pf.token)) {
            emit("error", null, 0, "Unexpected transfer");
            return false;
        }

        File dir = new File(context.getCacheDir(), "localsend");
        if (!dir.exists()) dir.mkdirs();
        File target = new File(dir, safeName(pf.fileName));
        FileOutputStream fos = null;
        try {
            fos = new FileOutputStream(target);
            long total = pf.size > 0 ? pf.size : contentLength;
            byte[] buf = new byte[64 * 1024];
            long got = 0;
            int last = -1;
            while (contentLength <= 0 || got < contentLength) {
                int want = buf.length;
                if (contentLength > 0) {
                    want = (int) Math.min(buf.length, contentLength - got);
                }
                int n = in.read(buf, 0, want);
                if (n <= 0) break;
                fos.write(buf, 0, n);
                got += n;
                int pct = total > 0 ? (int) (got * 100 / total) : 0;
                if (pct != last) {
                    last = pct;
                    emit("receiving", pf.fileName, pct, null);
                }
            }
            fos.flush();
            fos.close();
            fos = null;
            synchronized (pending) {
                pending.remove(fileId);
            }
            emit("received", pf.fileName, 100, null);
            if (pf.fileName != null && pf.fileName.toLowerCase().endsWith(".apk")) {
                openInstaller(target, pf.fileName);
            }
            return true;
        } catch (Exception e) {
            emit("error", pf.fileName, 0, "Transfer failed");
            return false;
        } finally {
            if (fos != null) {
                try {
                    fos.close();
                } catch (Exception ignored) {
                }
            }
        }
    }

    /** Hands the received APK to the system installer so the TV shows Install. */
    private void openInstaller(File apk, String fileName) {
        try {
            Uri uri = FileProvider.getUriForFile(
                    context, context.getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            emit("installing", fileName, 100, null);
        } catch (Exception e) {
            emit("error", fileName, 100, "Saved, but the installer wouldn't open");
        }
    }

    // --------------------------------------------------------------- helpers

    private void emit(String phase, String fileName, int percent, String error) {
        if (events != null) events.onEvent(phase, fileName, percent, error);
    }

    private static String safeName(String name) {
        if (name == null || name.trim().isEmpty()) return "download.bin";
        return name.replaceAll("[^A-Za-z0-9._-]", "_");
    }

    private static String decode(String s) {
        try {
            return java.net.URLDecoder.decode(s, "UTF-8");
        } catch (Exception e) {
            return s;
        }
    }

    private static String readLine(InputStream in) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') bos.write(c);
        }
        if (bos.size() == 0 && c == -1) return null;
        return bos.toString("UTF-8");
    }

    private static byte[] readBody(InputStream in, long length) throws Exception {
        if (length <= 0) return new byte[0];
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        long got = 0;
        while (got < length) {
            int n = in.read(buf, 0, (int) Math.min(buf.length, length - got));
            if (n <= 0) break;
            bos.write(buf, 0, n);
            got += n;
        }
        return bos.toByteArray();
    }

    private static void respond(OutputStream out, int code, String json) throws Exception {
        byte[] body = json.getBytes("UTF-8");
        StringBuilder sb = new StringBuilder();
        sb.append("HTTP/1.1 ").append(code).append(code == 200 ? " OK" : " ERROR").append("\r\n");
        sb.append("Content-Type: application/json\r\n");
        sb.append("Content-Length: ").append(body.length).append("\r\n");
        sb.append("Connection: close\r\n\r\n");
        out.write(sb.toString().getBytes("UTF-8"));
        out.write(body);
        out.flush();
    }

    private static void closeQuietly(java.io.Closeable c) {
        if (c == null) return;
        try {
            c.close();
        } catch (Exception ignored) {
        }
    }
}
