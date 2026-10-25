package uk.bmsupport.tvenabler;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.Arrays;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.interfaces.RSAPublicKey;
import javax.crypto.Cipher;

/**
 * Tiny ADB-over-Wi-Fi client (no libraries) used to switch BM Remote Control on for a Fire TV
 * from the customer's phone. Fire OS blocks a TV from opening its own ADB, but another device
 * on the same Wi-Fi is allowed; the TV shows "Allow debugging?" the first time.
 */
public final class AdbClient implements AutoCloseable {
    private static final int CNXN = 0x4e584e43, AUTH = 0x48545541, OPEN = 0x4e45504f,
            OKAY = 0x59414b4f, CLSE = 0x45534c43, WRTE = 0x45545257;
    private static final byte[] SHA1_PREFIX = {0x30, 0x21, 0x30, 0x09, 0x06, 0x05, 0x2b, 0x0e, 0x03, 0x02, 0x1a, 0x05, 0x00, 0x04, 0x14};

    private final Socket socket;
    private final DataInputStream in;
    private final OutputStream out;
    private int nextLocal = 1;

    private static final class Msg { int cmd, a0, a1; byte[] data; }

    private AdbClient(Socket s) throws IOException {
        socket = s; in = new DataInputStream(s.getInputStream()); out = s.getOutputStream();
    }

    /** Connects and signs in. Waits up to two minutes for the customer to press Allow on the TV. */
    public static AdbClient connect(String host, int port, KeyPair keys, byte[] publicKeyLine) throws Exception {
        Socket s = new Socket();
        s.connect(new InetSocketAddress(host, port), 5000);
        s.setSoTimeout(120_000);
        AdbClient c = new AdbClient(s);
        try {
            c.send(CNXN, 0x01000000, 256 * 1024, "host::\0".getBytes(StandardCharsets.UTF_8));
            boolean sentSig = false, sentKey = false;
            while (true) {
                Msg m = c.read();
                if (m.cmd == CNXN) return c;
                if (m.cmd != AUTH || m.a0 != 1) throw new IOException("Unexpected reply from TV");
                if (!sentSig) {
                    c.send(AUTH, 2, 0, sign(keys, m.data)); sentSig = true;
                } else if (!sentKey) {
                    c.send(AUTH, 3, 0, publicKeyLine); sentKey = true;
                } else throw new IOException("The TV refused this phone");
            }
        } catch (Exception e) { c.close(); throw e; }
    }

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
        sendSync(localId, remote, "SEND", (remotePath + ",33206").getBytes(StandardCharsets.UTF_8));
        byte[] buf = new byte[65536];
        try (FileInputStream in = new FileInputStream(local)) {
            int r;
            while ((r = in.read(buf)) > 0) sendSync(localId, remote, "DATA", Arrays.copyOf(buf, r));
        }
        ByteBuffer done = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt((int) (System.currentTimeMillis() / 1000));
        sendSync(localId, remote, "DONE", done.array());
        ByteArrayOutputStream resp = new ByteArrayOutputStream();
        while (true) {
            Msg m = read();
            if (m.a1 != localId) continue;
            if (m.cmd == WRTE) { resp.write(m.data); send(OKAY, localId, m.a0, new byte[0]); continue; }
            if (m.cmd == CLSE) { send(CLSE, localId, remote, new byte[0]); break; }
        }
        byte[] r = resp.toByteArray();
        if (r.length < 8) throw new IOException("No answer from the TV during the file send");
        String id = new String(r, 0, 4, StandardCharsets.UTF_8);
        if (!"OKAY".equals(id)) {
            int len = ByteBuffer.wrap(r, 4, 4).order(ByteOrder.LITTLE_ENDIAN).getInt();
            String msg = r.length > 8 ? new String(r, 8, Math.min(len, r.length - 8), StandardCharsets.UTF_8) : "unknown reason";
            throw new IOException("The TV refused the file: " + msg);
        }
    }

    private void sendSync(int localId, int remote, String id, byte[] payload) throws IOException {
        ByteBuffer b = ByteBuffer.allocate(8 + payload.length).order(ByteOrder.LITTLE_ENDIAN);
        b.put(id.getBytes(StandardCharsets.UTF_8)).putInt(payload.length).put(payload);
        send(WRTE, localId, remote, b.array());
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
        int len = b.getInt();
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
