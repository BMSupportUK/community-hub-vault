package uk.bmsupport.tvenabler;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.File;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.interfaces.RSAPublicKey;
import java.util.Arrays;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Runs AdbClient against a fake TV that behaves like AOSP adbd:
 * it re-asks for the key once its Allow-box service is ready, the customer takes over 20 seconds
 * to press Allow, it only accepts 4096-byte packets and acknowledges every write.
 */
public final class AdbClientTest {
    private static void check(boolean v, String rule) { if (!v) throw new AssertionError(rule); }

    static void send(OutputStream o, int cmd, int a0, int a1, byte[] d) throws Exception {
        ByteBuffer b = ByteBuffer.allocate(24 + d.length).order(ByteOrder.LITTLE_ENDIAN);
        int sum = 0; for (byte x : d) sum += x & 0xff;
        b.putInt(cmd).putInt(a0).putInt(a1).putInt(d.length).putInt(sum).putInt(~cmd).put(d);
        o.write(b.array()); o.flush();
    }

    static AdbClient.Msg read(DataInputStream in) throws Exception {
        byte[] h = new byte[24]; in.readFully(h);
        ByteBuffer b = ByteBuffer.wrap(h).order(ByteOrder.LITTLE_ENDIAN);
        AdbClient.Msg m = new AdbClient.Msg(); m.cmd = b.getInt(); m.a0 = b.getInt(); m.a1 = b.getInt();
        int len = b.getInt(); m.data = new byte[len]; b.getInt(); b.getInt(); in.readFully(m.data);
        return m;
    }

    static byte[] token() { byte[] t = new byte[20]; new SecureRandom().nextBytes(t); return t; }

    public static void main(String[] args) throws Exception {
        KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(2048);
        KeyPair kp = g.genKeyPair();
        byte[] keyLine = (Base64.getEncoder().encodeToString(AdbClient.publicKey((RSAPublicKey) kp.getPublic())) + " bm-tv-enabler\0").getBytes(StandardCharsets.UTF_8);
        byte[] apk = new byte[150_000]; new SecureRandom().nextBytes(apk);
        File local = File.createTempFile("bm-helper", ".apk"); Files.write(local.toPath(), apk);

        // 1 + 2: Allow box retry, slow Allow press, then a file push with flow control.
        AtomicReference<Throwable> tvError = new AtomicReference<>();
        AtomicReference<byte[]> received = new AtomicReference<>();
        int[] keysSeen = {0};
        try (ServerSocket server = new ServerSocket(0)) {
            Thread tv = new Thread(() -> {
                try (Socket s = server.accept()) {
                    DataInputStream in = new DataInputStream(s.getInputStream()); OutputStream o = s.getOutputStream();
                    check(read(in).cmd == AdbClient.CNXN, "Phone opens with CNXN");
                    send(o, AdbClient.AUTH, 1, 0, token());
                    check(read(in).a0 == 2, "Phone signs first");
                    send(o, AdbClient.AUTH, 1, 0, token());
                    AdbClient.Msg k = read(in); check(k.a0 == 3 && Arrays.equals(k.data, keyLine), "Phone sends its key"); keysSeen[0]++;
                    Thread.sleep(500);
                    send(o, AdbClient.AUTH, 1, 0, token()); // AOSP needs_retry: Allow-box service now ready
                    k = read(in); check(k.a0 == 3, "Phone sends its key again when asked again"); keysSeen[0]++;
                    Thread.sleep(22_000); // customer takes longer than 20 seconds to press Allow
                    send(o, AdbClient.CNXN, 0x01000000, 4096, "device::\0".getBytes(StandardCharsets.UTF_8));
                    AdbClient.Msg open = read(in);
                    check(open.cmd == AdbClient.OPEN && new String(open.data, StandardCharsets.UTF_8).startsWith("sync:"), "Phone opens sync");
                    int phone = open.a0;
                    send(o, AdbClient.OKAY, 77, phone, new byte[0]);
                    ByteArrayOutputStream stream = new ByteArrayOutputStream();
                    while (true) {
                        AdbClient.Msg m = read(in);
                        if (m.cmd == AdbClient.CLSE) break;
                        if (m.cmd != AdbClient.WRTE) continue;
                        check(m.data.length <= 4096, "Phone never sends more than the TV allows");
                        stream.write(m.data);
                        send(o, AdbClient.OKAY, 77, phone, new byte[0]);
                        byte[] st = stream.toByteArray();
                        ByteBuffer b = ByteBuffer.wrap(st).order(ByteOrder.LITTLE_ENDIAN);
                        ByteArrayOutputStream file = new ByteArrayOutputStream();
                        boolean done = false;
                        while (b.remaining() >= 8) {
                            int p = b.position();
                            String id = new String(st, p, 4, StandardCharsets.US_ASCII); b.position(p + 4);
                            int word = b.getInt();
                            if (id.equals("DONE")) { done = true; check(word > 1_600_000_000, "DONE carries the file time"); break; }
                            if (id.equals("QUIT")) break;
                            if (b.remaining() < word) { b.position(p); break; }
                            byte[] body = new byte[word]; b.get(body);
                            if (id.equals("DATA")) file.write(body);
                            else check(id.equals("SEND") && new String(body, StandardCharsets.UTF_8).startsWith("/data/local/tmp/bm-helper.apk,"), "SEND names the file");
                        }
                        if (done && received.get() == null) {
                            check(b.remaining() == 0 || new String(st, b.position(), 4, StandardCharsets.US_ASCII).equals("QUIT"), "DONE has no body");
                            received.set(file.toByteArray());
                            send(o, AdbClient.WRTE, 77, phone, "OKAY\0\0\0\0".getBytes(StandardCharsets.US_ASCII));
                        }
                    }
                } catch (Throwable t) { tvError.set(t); }
            });
            tv.start();
            long t0 = System.currentTimeMillis();
            try (AdbClient c = AdbClient.connect("127.0.0.1", server.getLocalPort(), kp, keyLine)) {
                check(System.currentTimeMillis() - t0 > 21_000, "Phone kept waiting while the Allow box was up");
                c.push(local, "/data/local/tmp/bm-helper.apk");
            }
            tv.join(10_000);
        }
        if (tvError.get() != null) throw new AssertionError("Fake TV failed", tvError.get());
        check(keysSeen[0] == 2, "Key sent twice");
        check(Arrays.equals(received.get(), apk), "TV received the exact file");

        // 3: a TV that accepts but never asks to sign in is reported as such, not as "Allow not pressed".
        try (ServerSocket server = new ServerSocket(0)) {
            Thread tv = new Thread(() -> { try { while (true) { Socket s = server.accept(); s.getInputStream(); } } catch (Exception ignored) { } });
            tv.setDaemon(true); tv.start();
            try {
                AdbClient.connect("127.0.0.1", server.getLocalPort(), kp, keyLine, 3000, 1000).close();
                throw new AssertionError("Must not connect");
            } catch (AdbClient.NotAuthorized e) {
                check(!e.keySent && e.getMessage().contains("no sign-in request"), "Say the TV never asked: " + e.getMessage());
            }
        }
        local.delete();
        System.out.println("AdbClientTest: all checks passed");
    }
}
