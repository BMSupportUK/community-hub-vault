package uk.bmsupport.app.localsend;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.MulticastSocket;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.URL;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * Speaks the LocalSend v2 protocol so members can push an APK from the BM Support
 * app straight to a Fire Stick / Android box running LocalSend on the same Wi-Fi.
 *
 * Discovery: multicast announce on 224.0.0.167:53317 plus an HTTP /register sweep
 * of the local /24 for devices that block multicast (common on Fire TV).
 * Sending: prepare-upload -> wait for accept -> stream bytes to /upload.
 */
@CapacitorPlugin(name = "LocalSend")
public class LocalSendPlugin extends Plugin {

    private static final int PORT = 53317;
    private static final String MULTICAST_GROUP = "224.0.0.167";
    private static final String ALIAS = "BM Support";

    private final ExecutorService pool = Executors.newFixedThreadPool(24);
    private final Set<String> seen = Collections.synchronizedSet(new HashSet<String>());
    private final AtomicBoolean cancelled = new AtomicBoolean(false);
    private String fingerprint;
    private LocalSendReceiver receiver;


    private String fingerprint() {
        if (fingerprint == null) {
            byte[] rnd = new byte[16];
            new SecureRandom().nextBytes(rnd);
            fingerprint = Base64.encodeToString(rnd, Base64.NO_WRAP).replaceAll("[^A-Za-z0-9]", "");
        }
        return fingerprint;
    }

    private JSONObject selfInfo(boolean announce) throws Exception {
        JSONObject o = new JSONObject();
        o.put("alias", ALIAS);
        o.put("version", "2.0");
        o.put("deviceModel", android.os.Build.MODEL);
        o.put("deviceType", "mobile");
        o.put("fingerprint", fingerprint());
        o.put("port", PORT);
        o.put("protocol", "http");
        o.put("download", false);
        o.put("announce", announce);
        return o;
    }

    // ---------------------------------------------------------------- scan

    @PluginMethod
    public void scan(final PluginCall call) {
        cancelled.set(false);
        seen.clear();
        // Discovery runs through the always-on receiver: it already owns UDP 53317,
        // so a second socket here would swallow half the replies. Peers answer an
        // announcement either by UDP or by POSTing /register to us — both arrive there.
        final LocalSendReceiver r = ensureReceiver();
        r.setPeers(new LocalSendReceiver.Peers() {
            @Override
            public void onPeer(String ip, JSONObject info) {
                emitDevice(ip, info);
            }
        });
        try {
            r.start();
        } catch (Exception ignored) {
        }
        pool.execute(new Runnable() {
            @Override
            public void run() {
                // Repeat: LocalSend on Fire TV frequently misses a single packet.
                for (int i = 0; i < 6 && !cancelled.get(); i++) {
                    r.announce();
                    try {
                        Thread.sleep(900);
                    } catch (InterruptedException e) {
                        return;
                    }
                }
            }
        });
        pool.execute(new Runnable() {
            @Override
            public void run() {
                sweepSubnet();
            }
        });
        call.resolve();
    }

    private void multicastDiscover() {
        WifiManager wm = (WifiManager) getContext().getApplicationContext()
                .getSystemService(Context.WIFI_SERVICE);
        WifiManager.MulticastLock lock = null;
        MulticastSocket socket = null;
        try {
            if (wm != null) {
                lock = wm.createMulticastLock("bm-localsend");
                lock.setReferenceCounted(true);
                lock.acquire();
            }
            socket = new MulticastSocket(PORT);
            socket.setReuseAddress(true);
            socket.setSoTimeout(1000);
            InetAddress group = InetAddress.getByName(MULTICAST_GROUP);
            try {
                socket.joinGroup(group);
            } catch (Exception ignored) {
            }

            byte[] payload = selfInfo(true).toString().getBytes("UTF-8");
            socket.send(new DatagramPacket(payload, payload.length, group, PORT));

            long until = System.currentTimeMillis() + 6000;
            while (System.currentTimeMillis() < until && !cancelled.get()) {
                try {
                    byte[] buf = new byte[8192];
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    socket.receive(p);
                    String body = new String(p.getData(), 0, p.getLength(), "UTF-8");
                    JSONObject info = new JSONObject(body);
                    String ip = p.getAddress().getHostAddress();
                    if (info.optBoolean("announce", false)) {
                        // Reply directly so the peer also learns about us.
                        byte[] reply = selfInfo(false).toString().getBytes("UTF-8");
                        socket.send(new DatagramPacket(reply, reply.length, p.getAddress(), PORT));
                    }
                    emitDevice(ip, info);
                } catch (Exception ignored) {
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (socket != null) {
                try {
                    socket.close();
                } catch (Exception ignored) {
                }
            }
            if (lock != null && lock.isHeld()) {
                lock.release();
            }
        }
    }

    private void sweepSubnet() {
        String base = localSubnetBase();
        if (base == null) return;
        for (int i = 1; i < 255; i++) {
            final String host = base + i;
            pool.execute(new Runnable() {
                @Override
                public void run() {
                    if (cancelled.get()) return;
                    if (!portOpen(host)) return;
                    JSONObject info = register(host, "http");
                    if (info == null) info = register(host, "https");
                    if (info != null) emitDevice(host, info);
                }
            });
        }
    }

    private boolean portOpen(String host) {
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(host, PORT), 350);
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            try {
                s.close();
            } catch (Exception ignored) {
            }
        }
    }

    /** POST our info to /register; the peer replies with its own info. */
    private JSONObject register(String host, String protocol) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(protocol + "://" + host + ":" + PORT + "/api/localsend/v2/register");
            conn = open(url);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(2500);
            conn.setReadTimeout(4000);
            conn.setRequestProperty("Content-Type", "application/json");
            OutputStream os = conn.getOutputStream();
            os.write(selfInfo(false).toString().getBytes("UTF-8"));
            os.close();
            if (conn.getResponseCode() / 100 != 2) return null;
            String body = readAll(conn.getInputStream());
            JSONObject info = body.trim().startsWith("{") ? new JSONObject(body) : new JSONObject();
            if (!info.has("protocol")) info.put("protocol", protocol);
            return info;
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void emitDevice(String ip, JSONObject info) {
        if (ip == null) return;
        if (fingerprint().equals(info.optString("fingerprint"))) return;
        if (!seen.add(ip)) return;
        JSObject ev = new JSObject();
        ev.put("ip", ip);
        ev.put("port", info.optInt("port", PORT));
        ev.put("protocol", info.optString("protocol", "http"));
        ev.put("alias", info.optString("alias", ip));
        ev.put("deviceModel", info.optString("deviceModel", ""));
        ev.put("deviceType", info.optString("deviceType", ""));
        ev.put("fingerprint", info.optString("fingerprint", ""));
        notifyListeners("localSendDevice", ev);
    }

    // ---------------------------------------------------------------- send

    @PluginMethod
    public void send(final PluginCall call) {
        call.setKeepAlive(true);
        cancelled.set(false);
        final String host = call.getString("deviceIp");
        final int port = call.getInt("port", PORT);
        final String protocol = call.getString("protocol", "http");
        final String url = call.getString("url");
        final String fileName = call.getString("fileName", "app.apk");
        final long size = call.getLong("size", 0L);
        if (host == null || url == null) {
            call.reject("Missing device or file");
            return;
        }
        pool.execute(new Runnable() {
            @Override
            public void run() {
                doSend(call, protocol, host, port, url, fileName, size);
            }
        });
    }

    private void doSend(PluginCall call, String protocol, String host, int port,
                        String fileUrl, String fileName, long declaredSize) {
        HttpURLConnection src = null;
        try {
            progress(call, "preparing", 0);

            src = open(new URL(fileUrl));
            src.setInstanceFollowRedirects(true);
            src.setConnectTimeout(15000);
            src.setReadTimeout(30000);
            if (src.getResponseCode() / 100 != 2) {
                call.reject("Couldn't fetch the app file (" + src.getResponseCode() + ")");
                return;
            }
            long size = declaredSize > 0 ? declaredSize : Math.max(0, src.getContentLength());

            String base = protocol + "://" + host + ":" + port + "/api/localsend/v2";
            String fileId = "bm-" + System.currentTimeMillis();

            JSONObject file = new JSONObject();
            file.put("id", fileId);
            file.put("fileName", fileName);
            file.put("size", size);
            file.put("fileType", "application/vnd.android.package-archive");
            JSONObject files = new JSONObject();
            files.put(fileId, file);
            JSONObject prepare = new JSONObject();
            prepare.put("info", selfInfo(false));
            prepare.put("files", files);

            progress(call, "waiting", 0);
            HttpURLConnection pc = open(new URL(base + "/prepare-upload"));
            pc.setRequestMethod("POST");
            pc.setDoOutput(true);
            pc.setConnectTimeout(8000);
            pc.setReadTimeout(180000);
            pc.setRequestProperty("Content-Type", "application/json");
            OutputStream po = pc.getOutputStream();
            po.write(prepare.toString().getBytes("UTF-8"));
            po.close();
            int code = pc.getResponseCode();
            if (code == 403 || code == 401) {
                call.reject("The TV declined the transfer");
                return;
            }
            if (code == 409) {
                call.reject("LocalSend on the TV is busy with another transfer");
                return;
            }
            if (code / 100 != 2) {
                call.reject("LocalSend on the TV refused the request (" + code + ")");
                return;
            }
            JSONObject prep = new JSONObject(readAll(pc.getInputStream()));
            String sessionId = prep.optString("sessionId", "");
            JSONObject tokens = prep.optJSONObject("files");
            String token = tokens == null ? "" : tokens.optString(fileId, "");
            pc.disconnect();
            if (sessionId.isEmpty() || token.isEmpty()) {
                call.reject("The TV didn't accept the file");
                return;
            }

            HttpURLConnection up = open(new URL(base + "/upload?sessionId=" + enc(sessionId)
                    + "&fileId=" + enc(fileId) + "&token=" + enc(token)));
            up.setRequestMethod("POST");
            up.setDoOutput(true);
            up.setConnectTimeout(8000);
            up.setReadTimeout(600000);
            up.setRequestProperty("Content-Type", "application/octet-stream");
            if (size > 0) {
                up.setFixedLengthStreamingMode(size);
            } else {
                up.setChunkedStreamingMode(64 * 1024);
            }

            InputStream in = src.getInputStream();
            OutputStream out = up.getOutputStream();
            byte[] buf = new byte[64 * 1024];
            long sent = 0;
            int last = -1;
            int n;
            while ((n = in.read(buf)) > 0) {
                if (cancelled.get()) {
                    try {
                        out.close();
                    } catch (Exception ignored) {
                    }
                    cancelSession(base, sessionId);
                    call.reject("Transfer cancelled");
                    return;
                }
                out.write(buf, 0, n);
                sent += n;
                int pct = size > 0 ? (int) (sent * 100 / size) : 0;
                if (pct != last) {
                    last = pct;
                    progress(call, "sending", pct);
                }
            }
            out.flush();
            out.close();
            in.close();

            int uc = up.getResponseCode();
            up.disconnect();
            if (uc / 100 != 2) {
                call.reject("The transfer was interrupted (" + uc + ")");
                return;
            }
            progress(call, "done", 100);
            JSObject res = new JSObject();
            res.put("ok", true);
            call.resolve(res);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "Wi-Fi send failed" : e.getMessage());
        } finally {
            if (src != null) src.disconnect();
        }
    }

    private void cancelSession(String base, String sessionId) {
        try {
            HttpURLConnection c = open(new URL(base + "/cancel?sessionId=" + enc(sessionId)));
            c.setRequestMethod("POST");
            c.setConnectTimeout(3000);
            c.getResponseCode();
            c.disconnect();
        } catch (Exception ignored) {
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled.set(true);
        call.resolve();
    }

    // ------------------------------------------------------------- receiving

    /** Starts (or confirms) the built-in LocalSend receiver on this device. */
    @PluginMethod
    public void startReceiver(PluginCall call) {
        try {
            ensureReceiver().start();
            JSObject res = new JSObject();
            res.put("running", true);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Couldn't start the Wi-Fi receiver: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopReceiver(PluginCall call) {
        if (receiver != null) receiver.stop();
        JSObject res = new JSObject();
        res.put("running", false);
        call.resolve(res);
    }

    @PluginMethod
    public void receiverStatus(PluginCall call) {
        JSObject res = new JSObject();
        res.put("running", receiver != null && receiver.isRunning());
        call.resolve(res);
    }

    private synchronized LocalSendReceiver ensureReceiver() {
        if (receiver == null) {
            receiver = new LocalSendReceiver(getContext(), ALIAS + " TV", new LocalSendReceiver.Events() {
                @Override
                public void onEvent(String phase, String fileName, int percent, String error) {
                    JSObject ev = new JSObject();
                    ev.put("phase", phase);
                    ev.put("fileName", fileName == null ? "" : fileName);
                    ev.put("percent", percent);
                    ev.put("error", error == null ? "" : error);
                    notifyListeners("localSendReceive", ev);
                }
            });
        }
        return receiver;
    }

    /** Listen from app start so a sender finds this device without any setup. */
    @Override
    public void load() {
        try {
            ensureReceiver().start();
        } catch (Exception ignored) {
        }
    }


    // ------------------------------------------------------------- helpers

    private void progress(PluginCall call, String phase, int percent) {
        JSObject ev = new JSObject();
        ev.put("phase", phase);
        ev.put("percent", percent);
        notifyListeners("localSendProgress", ev);
    }

    private static String enc(String s) throws Exception {
        return java.net.URLEncoder.encode(s, "UTF-8");
    }

    private static String readAll(InputStream in) throws Exception {
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
        in.close();
        return bos.toString("UTF-8");
    }

    /**
     * LocalSend peers use self-signed certificates, so HTTPS to a LAN peer needs a
     * permissive trust manager. This applies only to sockets we open here — the
     * app's global TLS trust is untouched.
     */
    private HttpURLConnection open(URL url) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        if (conn instanceof HttpsURLConnection && isPrivateHost(url.getHost())) {
            HttpsURLConnection https = (HttpsURLConnection) conn;
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, new TrustManager[]{new X509TrustManager() {
                public void checkClientTrusted(X509Certificate[] c, String a) {
                }

                public void checkServerTrusted(X509Certificate[] c, String a) {
                }

                public X509Certificate[] getAcceptedIssuers() {
                    return new X509Certificate[0];
                }
            }}, new SecureRandom());
            https.setSSLSocketFactory(ctx.getSocketFactory());
            https.setHostnameVerifier(new HostnameVerifier() {
                public boolean verify(String hostname, SSLSession session) {
                    return isPrivateHost(hostname);
                }
            });
        }
        return conn;
    }

    private static boolean isPrivateHost(String host) {
        if (host == null) return false;
        return host.startsWith("192.168.") || host.startsWith("10.")
                || host.matches("^172\\.(1[6-9]|2\\d|3[01])\\..*")
                || host.equals("127.0.0.1") || host.startsWith("169.254.");
    }

    private String localSubnetBase() {
        try {
            Enumeration<NetworkInterface> ifaces = NetworkInterface.getNetworkInterfaces();
            while (ifaces.hasMoreElements()) {
                NetworkInterface ni = ifaces.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                List<java.net.InterfaceAddress> addrs = ni.getInterfaceAddresses();
                for (java.net.InterfaceAddress ia : addrs) {
                    InetAddress a = ia.getAddress();
                    if (a instanceof Inet4Address && isPrivateHost(a.getHostAddress())) {
                        String ip = a.getHostAddress();
                        return ip.substring(0, ip.lastIndexOf('.') + 1);
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    @Override
    protected void handleOnDestroy() {
        cancelled.set(true);
        if (receiver != null) receiver.stop();
        pool.shutdownNow();
        try {
            pool.awaitTermination(1, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
        }
    }
}
