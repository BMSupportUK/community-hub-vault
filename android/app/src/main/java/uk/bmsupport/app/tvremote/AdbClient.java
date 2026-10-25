package uk.bmsupport.app.tvremote;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.EOFException;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.interfaces.RSAPublicKey;
import javax.crypto.Cipher;

/**
 * Tiny ADB-over-Wi-Fi client (no libraries) used to switch BM Remote Control on for a TV
 * from the customer's phone. Follows AOSP adb: signature first, then the public key, and the
 * key is sent again whenever adbd asks again (adbd re-asks once its Allow-box service is ready).
 * The connection is kept open while the Allow box is on screen — closing it cancels the request.
 */
public final class AdbClient implements AutoCloseable {
    static final int CNXN = 0x4e584e43, AUTH = 0x48545541, OPEN = 0x4e45504f,
            OKAY = 0x59414b4f, CLSE = 0x45534c43, WRTE = 0x45545257;
    private static final byte[] SHA1_PREFIX = {0x30, 0x21, 0x30, 0x09, 0x06, 0x05, 0x2b, 0x0e, 0x03, 0x02, 0x1a, 0x05, 0x00, 0x04, 0x14};
    /** Max packet body before the TV says otherwise (AOSP MAX_PAYLOAD_V1). */
    private static final int MAX_V1 = 4096, OUR_MAX = 256 * 1024;

    private final Socket socket;
    private final DataInputStream in;
    private final OutputStream out;
    private int nextLocal = 1;
    private int maxData = MAX_V1;

    static final class Msg { int cmd, a0, a1; byte[] data; }

    private AdbClient(Socket s) throws IOException {
        socket = s; in = new DataInputStream(s.getInputStream()); out = s.getOutputStream();
    }

    /** The TV never answered at all — wrong address, debugging off, or Wi-Fi isolation. */
    public static final class NotReachable extends IOException {
        NotReachable(String msg) { super(msg); }
    }

    /** The TV was reached but never let this phone in. The message says how far it got. */
    public static final class NotAuthorized extends IOException {
        final boolean keySent;
        NotAuthorized(String msg, boolean keySent) { super(msg); this.keySent = keySent; }
    }

    public static AdbClient connect(String host, int port, KeyPair keys, byte[] publicKeyLine) throws Exception {
        return connect(host, port, keys, publicKeyLine, 150_000, 15_000);
    }

    /**
     * Connects and signs in within {@code totalMs}. {@code quietMs} is how long to wait for the TV's
     * first sign-in request before reconnecting; once the key is sent we wait the full remaining time.
     */
    static AdbClient connect(String host, int port, KeyPair keys, byte[] publicKeyLine, long totalMs, int quietMs) throws Exception {
        long start = System.currentTimeMillis(), deadline = start + totalMs;
        boolean everConnected = false, everAsked = false, everSentKey = false;
        String stage = "never answered";
        while (System.currentTimeMillis() < deadline) {
            Socket s = new Socket();
            try {
                s.connect(new InetSocketAddress(host, port), 5000);
            } catch (IOException e) {
                try { s.close(); } catch (IOException ignored) { }
                if (!everConnected) stage = "nothing answered (" + e.getClass().getSimpleName() + ")";
                if (!everConnected && System.currentTimeMillis() - start > 20_000) break;
                pause(2000);
                continue;
            }
            everConnected = true;
            AdbClient c = new AdbClient(s);
            boolean keySent = false;
            try {
                c.send(CNXN, 0x01000000, OUR_MAX, "host::\0".getBytes(StandardCharsets.UTF_8));
                int tokens = 0;
                while (true) {
                    long left = deadline - System.currentTimeMillis();
                    if (left <= 0) throw new SocketTimeoutException("deadline");
                    s.setSoTimeout((int) Math.max(1, keySent ? left : Math.min(quietMs, left)));
                    Msg m = c.read();
                    if (m.cmd == CNXN) {
                        c.maxData = Math.max(MAX_V1, Math.min(OUR_MAX, m.a1));
                        s.setSoTimeout(120_000);
                        return c;
                    }
                    if (m.cmd != AUTH || m.a0 != 1)
                        throw new IOException(String.format("TV sent an unexpected reply (0x%08x)", m.cmd));
                    if (m.data.length != 20) throw new IOException("TV sent a bad sign-in request");
                    everAsked = true;
                    tokens++;
                    if (tokens == 1) {
                        c.send(AUTH, 2, 0, sign(keys, m.data));
                        stage = "TV asked to sign in; phone signed, waiting";
                    } else if (tokens <= 20) {
                        c.send(AUTH, 3, 0, publicKeyLine);
                        keySent = everSentKey = true;
                        stage = "phone sent its key " + (tokens - 1) + "x; TV should show Allow box";
                    } else throw new IOException("TV kept asking to sign in");
                }
            } catch (SocketTimeoutException e) {
                c.close();
                if (!everAsked) stage = "connected, but TV sent no sign-in request";
                if (keySent) break; // Waited the whole time with the Allow box up.
            } catch (EOFException | SocketException e) {
                c.close();
                if (!everAsked) stage = "connected, but TV closed the connection straight away";
                else if (keySent) stage = "TV closed the connection after the key was sent";
                pause(1000);
            } catch (Exception e) { c.close(); throw e; }
        }
        if (!everConnected) throw new NotReachable("Nothing answered at that address: " + stage);
        throw new NotAuthorized(stage, everSentKey);
    }

    private static void pause(long ms) throws InterruptedException { Thread.sleep(ms); }

    /** Runs a shell command on the TV and returns what it printed. */
    public String shell(String cmd) throws IOException {
        int local = nextLocal++;
        send(OPEN, local, 0, ("shell:" + cmd + "\0").getBytes(StandardCharsets.UTF_8));
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        int remote = 0;
        while (true) {
            Msg m = read();
            if (m.a1 != local) continue;
            if (m.cmd == OKAY) { remote = m.a0; continue; }
            if (m.cmd == WRTE) { buf.write(m.data); send(OKAY, local, m.a0, new byte[0]); continue; }
            if (m.cmd == CLSE) { if (remote != 0) send(CLSE, local, remote, new byte[0]); break; }
        }
        return buf.toString("UTF-8");
    }

    /** Pushes a local file to the TV using the ADB SYNC service (used to install BM Remote Helper). */
    public void push(File local, String remotePath) throws IOException {
        int localId = nextLocal++;
        send(OPEN, localId, 0, "sync:\0".getBytes(StandardCharsets.UTF_8));
        int remote = 0;
        while (true) {
            Msg m = read();
            if (m.a1 != localId) continue;
            if (m.cmd == OKAY) { remote = m.a0; break; }
            if (m.cmd == CLSE) throw new IOException("The TV refused the file send");
        }
        ByteArrayOutputStream reply = new ByteArrayOutputStream();
        byte[] path = (remotePath + ",33188").getBytes(StandardCharsets.UTF_8);
        streamWrite(localId, remote, syncPacket("SEND", path.length, path), reply);
        byte[] buf = new byte[65536]; // SYNC_DATA_MAX
        try (FileInputStream f = new FileInputStream(local)) {
            int r;
            while ((r = f.read(buf)) > 0) {
                byte[] chunk = new byte[r]; System.arraycopy(buf, 0, chunk, 0, r);
                streamWrite(localId, remote, syncPacket("DATA", r, chunk), reply);
            }
        }
        // DONE carries the file time in its length word, with no body.
        streamWrite(localId, remote, syncPacket("DONE", (int) (System.currentTimeMillis() / 1000), new byte[0]), reply);
        while (reply.size() < 8) {
            Msg m = read();
            if (m.a1 != localId) continue;
            if (m.cmd == WRTE) { reply.write(m.data); send(OKAY, localId, remote, new byte[0]); continue; }
            if (m.cmd == CLSE) break;
        }
        byte[] r = reply.toByteArray();
        if (r.length < 8) throw new IOException("No answer from the TV during the file send");
        String id = new String(r, 0, 4, StandardCharsets.US_ASCII);
        if (!"OKAY".equals(id)) {
            int len = ByteBuffer.wrap(r, 4, 4).order(ByteOrder.LITTLE_ENDIAN).getInt();
            String msg = r.length > 8 ? new String(r, 8, Math.max(0, Math.min(len, r.length - 8)), StandardCharsets.UTF_8) : "unknown reason";
            throw new IOException("The TV refused the file: " + msg);
        }
        try { streamWrite(localId, remote, syncPacket("QUIT", 0, new byte[0]), null); } catch (IOException ignored) { }
        send(CLSE, localId, remote, new byte[0]);
    }

    private static byte[] syncPacket(String id, int word, byte[] body) {
        ByteBuffer b = ByteBuffer.allocate(8 + body.length).order(ByteOrder.LITTLE_ENDIAN);
        b.put(id.getBytes(StandardCharsets.US_ASCII)).putInt(word).put(body);
        return b.array();
    }

    /** Sends stream bytes in packets the TV accepts, waiting for its OKAY after each one (ADB flow control). */
    private void streamWrite(int localId, int remote, byte[] data, ByteArrayOutputStream reply) throws IOException {
        for (int off = 0; off < data.length; off += maxData) {
            int n = Math.min(maxData, data.length - off);
            byte[] part = new byte[n]; System.arraycopy(data, off, part, 0, n);
            send(WRTE, localId, remote, part);
            while (true) {
                Msg m = read();
                if (m.a1 != localId) continue;
                if (m.cmd == OKAY) break;
                if (m.cmd == WRTE) { if (reply != null) reply.write(m.data); send(OKAY, localId, remote, new byte[0]); continue; }
                if (m.cmd == CLSE) throw new IOException("The TV stopped the file send");
            }
        }
    }

    private void send(int cmd, int a0, int a1, byte[] data) throws IOException {
        ByteBuffer b = ByteBuffer.allocate(24 + data.length).order(ByteOrder.LITTLE_ENDIAN);
        int sum = 0; for (byte x : data) sum += x & 0xff;
        b.putInt(cmd).putInt(a0).putInt(a1).putInt(data.length).putInt(sum).putInt(~cmd).put(data);
        out.write(b.array()); out.flush();
    }

    private Msg read() throws IOException {
        byte[] h = new byte[24]; in.readFully(h);
        ByteBuffer b = ByteBuffer.wrap(h).order(ByteOrder.LITTLE_ENDIAN);
        Msg m = new Msg(); m.cmd = b.getInt(); m.a0 = b.getInt(); m.a1 = b.getInt();
        int len = b.getInt(); b.getInt();
        int magic = b.getInt();
        if (magic != ~m.cmd) throw new IOException("Bad message from TV");
        if (len < 0 || len > 1024 * 1024) throw new IOException("Bad message from TV");
        m.data = new byte[len]; in.readFully(m.data);
        return m;
    }

    static byte[] sign(KeyPair keys, byte[] token) throws Exception {
        Cipher c = Cipher.getInstance("RSA/ECB/PKCS1Padding");
        c.init(Cipher.ENCRYPT_MODE, keys.getPrivate());
        c.update(SHA1_PREFIX);
        return c.doFinal(token);
    }

    /** Android's ADB public key layout (little-endian words, 2048-bit). */
    public static byte[] publicKey(RSAPublicKey k) {
        int words = 64;
        BigInteger r32 = BigInteger.ZERO.setBit(32);
        BigInteger n = k.getModulus();
        BigInteger rr = BigInteger.ZERO.setBit(words * 32).modPow(BigInteger.valueOf(2), n);
        BigInteger n0inv = n.remainder(r32).modInverse(r32);
        int[] myN = new int[words], myRr = new int[words];
        for (int i = 0; i < words; i++) {
            BigInteger[] res = rr.divideAndRemainder(r32); rr = res[0]; myRr[i] = res[1].intValue();
            res = n.divideAndRemainder(r32); n = res[0]; myN[i] = res[1].intValue();
        }
        ByteBuffer b = ByteBuffer.allocate(524).order(ByteOrder.LITTLE_ENDIAN);
        b.putInt(words).putInt(n0inv.negate().intValue());
        for (int v : myN) b.putInt(v);
        for (int v : myRr) b.putInt(v);
        b.putInt(k.getPublicExponent().intValue());
        return b.array();
    }

    @Override public void close() { try { socket.close(); } catch (IOException ignored) { } }
}
