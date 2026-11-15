package uk.bmsupport.player;

import java.util.concurrent.atomic.AtomicLong;

/**
 * User-requested broadband test. Timed, multi-connection like mainstream speed tests: several
 * parallel streams run for a fixed time, the ramp-up is ignored, and the rate is taken from the
 * bytes moved afterwards. Several test servers are tried in turn, and a failed upload never voids
 * a good download result (upload is reported as -1 = unavailable).
 */
final class BroadbandTest {
    static final int STREAMS = 4;
    static final long WARMUP_NANOS = 2_000_000_000L, DOWN_NANOS = 10_000_000_000L, UP_NANOS = 8_000_000_000L;
    static final long MIN_BYTES = 200_000;
    interface Progress { void phase(String message); }
    /** One stream's work: move bytes until stopped, adding each chunk to the counter. */
    interface Mover { void move(AtomicLong counter, java.util.function.BooleanSupplier stop) throws Exception; }
    interface Clock { long now(); }

    static final class Server {
        final String name, ping, down, up;
        Server(String name, String ping, String down, String up) { this.name = name; this.ping = ping; this.down = down; this.up = up; }
    }
    static final Server[] SERVERS = {
            new Server("Cloudflare", "https://speed.cloudflare.com/__down?bytes=0", "https://speed.cloudflare.com/__down?bytes=25000000", "https://speed.cloudflare.com/__up"),
            new Server("OVH", "https://proof.ovh.net/files/1Mb.dat", "https://proof.ovh.net/files/100Mb.dat", null),
            new Server("Tele2", "http://speedtest.tele2.net/1KB.zip", "http://speedtest.tele2.net/100MB.zip", "http://speedtest.tele2.net/upload.php"),
    };

    static final class Result {
        final int down, up, ping; final String server; final long measuredAt;
        Result(int down, int up, int ping, String server) { this.down = down; this.up = up; this.ping = ping; this.server = server; measuredAt = System.currentTimeMillis(); }
    }

    static int rate(long bytes, long nanos) {
        if (bytes <= 0 || nanos <= 0) throw new IllegalArgumentException("Invalid sample");
        return (int) Math.min(2_000_000, Math.round(bytes * 8_000_000.0 / nanos));
    }

    /** Rate from what moved after warm-up; on very slow lines that never get past warm-up, the whole run is used. */
    static int steadyRate(long bytesAtWarmup, long warmupAt, long bytesAtEnd, long endAt, long startAt) {
        long steady = bytesAtEnd - bytesAtWarmup, t = endAt - warmupAt;
        if (steady >= MIN_BYTES / 2 && t > 0) return rate(steady, t);
        if (bytesAtEnd >= MIN_BYTES && endAt > startAt) return rate(bytesAtEnd, endAt - startAt);
        return -1;
    }

    /** Runs the movers in parallel for the given time; returns kbps or -1 if too little moved. */
    static int timed(Mover mover, int streams, long duration, long warmup, Clock clock) throws InterruptedException {
        AtomicLong counter = new AtomicLong();
        long start = clock.now(), end = start + duration;
        java.util.function.BooleanSupplier stop = () -> Thread.currentThread().isInterrupted() || clock.now() >= end;
        Thread[] workers = new Thread[streams];
        for (int i = 0; i < streams; i++) {
            workers[i] = new Thread(() -> {
                // Each stream keeps reconnecting until time is up, so one dropped connection never ends the test.
                while (!stop.getAsBoolean()) {
                    try { mover.move(counter, stop); } catch (Exception e) {
                        try { Thread.sleep(200); } catch (InterruptedException ie) { return; }
                    }
                }
            }, "speed-" + i);
            workers[i].setDaemon(true); workers[i].start();
        }
        long warmBytes = -1, warmAt = 0;
        try {
            while (clock.now() < end) {
                if (warmBytes < 0 && clock.now() - start >= warmup) { warmBytes = counter.get(); warmAt = clock.now(); }
                Thread.sleep(50);
            }
        } finally { for (Thread w : workers) w.interrupt(); }
        long endAt = clock.now(), total = counter.get();
        if (warmBytes < 0) { warmBytes = 0; warmAt = start; }
        return steadyRate(warmBytes, warmAt, total, endAt, start);
    }

    static Result run() throws Exception { return run(m -> {}); }

    static Result run(Progress progress) throws Exception {
        Clock clock = System::nanoTime;
        Exception last = null;
        for (Server s : SERVERS) {
            if (Thread.currentThread().isInterrupted()) throw new java.io.InterruptedIOException();
            progress.phase("Checking the test server (" + s.name + ")…");
            int ping = ping(s.ping);
            if (ping < 0) { last = new java.io.IOException(s.name + " not reachable"); continue; }
            progress.phase("Measuring download speed (" + s.name + ")…");
            int down = timed((c, stop) -> download(s.down, c, stop), STREAMS, DOWN_NANOS, WARMUP_NANOS, clock);
            if (down <= 0) { last = new java.io.IOException(s.name + " download failed"); continue; }
            int up = -1;
            Server[] upOrder = upServers(s);
            for (Server u : upOrder) {
                progress.phase("Measuring upload speed (" + u.name + ")…");
                up = timed((c, stop) -> upload(u.up, c, stop), STREAMS, UP_NANOS, WARMUP_NANOS, clock);
                if (up > 0) break;
            }
            return new Result(down, up, ping, s.name);
        }
        throw last != null ? last : new java.io.IOException("No test server reachable");
    }

    private static Server[] upServers(Server first) {
        java.util.List<Server> l = new java.util.ArrayList<>();
        if (first.up != null) l.add(first);
        for (Server s : SERVERS) if (s != first && s.up != null) l.add(s);
        return l.toArray(new Server[0]);
    }

    private static java.net.HttpURLConnection open(String url) throws Exception {
        String sep = url.contains("?") ? "&" : "?";
        java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url + sep + "r=" + System.nanoTime()).openConnection();
        c.setConnectTimeout(6_000); c.setReadTimeout(8_000); c.setUseCaches(false);
        c.setRequestProperty("Accept-Encoding", "identity");
        c.setRequestProperty("User-Agent", "BM-Player-SpeedTest");
        return c;
    }

    /** Median of five small requests after one warm-up (DNS/TLS); -1 if the server never answers. */
    static int ping(String url) {
        long[] t = new long[5]; int n = 0;
        for (int i = 0; i < 6; i++) {
            try {
                java.net.HttpURLConnection c = open(url);
                long st = System.nanoTime();
                int code = c.getResponseCode();
                long el = System.nanoTime() - st;
                try (java.io.InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream()) { if (in != null) { byte[] b = new byte[4096]; int k = 0; while (k < 64 * 1024 && in.read(b) != -1) k += 4096; } } catch (Exception ignored) {}
                c.disconnect();
                if (code >= 400) continue;
                if (i > 0) t[n++] = el;
            } catch (Exception ignored) {}
        }
        if (n == 0) return -1;
        long[] a = java.util.Arrays.copyOf(t, n); java.util.Arrays.sort(a);
        return (int) Math.max(1, Math.round(a[n / 2] / 1_000_000.0));
    }

    private static void download(String url, AtomicLong counter, java.util.function.BooleanSupplier stop) throws Exception {
        java.net.HttpURLConnection c = open(url);
        try {
            int code = c.getResponseCode();
            if (code < 200 || code >= 300) throw new java.io.IOException("HTTP " + code);
            byte[] buf = new byte[65536];
            try (java.io.InputStream in = c.getInputStream()) {
                int n; while (!stop.getAsBoolean() && (n = in.read(buf)) != -1) counter.addAndGet(n);
            }
        } finally { c.disconnect(); }
    }

    private static void upload(String url, AtomicLong counter, java.util.function.BooleanSupplier stop) throws Exception {
        int size = 25_000_000;
        java.net.HttpURLConnection c = open(url);
        try {
            c.setRequestMethod("POST"); c.setDoOutput(true); c.setFixedLengthStreamingMode(size);
            c.setRequestProperty("Content-Type", "application/octet-stream");
            byte[] buf = new byte[65536]; new java.util.Random().nextBytes(buf);
            try (java.io.OutputStream out = c.getOutputStream()) {
                for (int sent = 0; sent < size && !stop.getAsBoolean();) {
                    int n = Math.min(buf.length, size - sent); out.write(buf, 0, n); sent += n; counter.addAndGet(n);
                }
            }
            if (!stop.getAsBoolean()) { int code = c.getResponseCode(); if (code >= 400) throw new java.io.IOException("HTTP " + code); }
        } finally { c.disconnect(); }
    }
}
