package uk.bmsupport.player;

/** User-requested, bounded Cloudflare tests. Traffic counters are not line speed. */
final class BroadbandTest {
    static final int[] SIZES = {1_000_000, 5_000_000, 20_000_000, 50_000_000};
    interface Transfer { Sample run(boolean upload, int bytes) throws Exception; }
    static final class Sample {
        final long bytes, nanos;
        Sample(long bytes, long nanos) { this.bytes = bytes; this.nanos = nanos; }
    }
    static final class Result {
        final int down, up, ping; final long measuredAt;
        Result(int down, int up, int ping) { this.down = down; this.up = up; this.ping = ping; measuredAt = System.currentTimeMillis(); }
    }
    static int rate(long bytes, long nanos) {
        if (bytes <= 0 || nanos <= 0) throw new IllegalArgumentException("Invalid sample");
        return (int) Math.min(2_000_000, Math.round(bytes * 8_000_000.0 / nanos));
    }
    static long median(long[] values) { long[] a = values.clone(); java.util.Arrays.sort(a); return a[a.length / 2]; }
    static int measure(boolean upload, Transfer transfer) throws Exception {
        long[] rates = new long[3], times = new long[3];
        for (int size : SIZES) {
            for (int i = 0; i < 3; i++) {
                Sample s = transfer.run(upload, size);
                if (s.bytes != size) throw new java.io.IOException("Incomplete speed test");
                rates[i] = rate(s.bytes, s.nanos); times[i] = s.nanos;
            }
            if (median(times) >= 1_000_000_000L) break;
        }
        return (int) median(rates);
    }
    static Result run() throws Exception {
        Transfer transfer = BroadbandTest::transfer;
        transfer.run(false, 0); // Warm up DNS/TLS before measuring latency.
        long[] latency = new long[5];
        for (int i = 0; i < 5; i++) latency[i] = transfer.run(false, 0).nanos;
        int down = measure(false, transfer), up = measure(true, transfer);
        return new Result(down, up, (int) Math.round(median(latency) / 1_000_000.0));
    }
    private static Sample transfer(boolean upload, int size) throws Exception {
        if (Thread.currentThread().isInterrupted()) throw new java.io.InterruptedIOException();
        String address = "https://speed.cloudflare.com/" + (upload ? "__up" : "__down?bytes=" + size + "&r=" + System.nanoTime());
        java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(address).openConnection();
        c.setConnectTimeout(10_000); c.setReadTimeout(20_000); c.setUseCaches(false);
        c.setRequestProperty("Accept-Encoding", "identity");
        long start = System.nanoTime(), received = 0;
        try {
            byte[] buffer = new byte[65536];
            if (upload) {
                c.setRequestMethod("POST"); c.setDoOutput(true); c.setFixedLengthStreamingMode(size);
                c.setRequestProperty("Content-Type", "application/octet-stream");
                try (java.io.OutputStream out = c.getOutputStream()) {
                    for (int sent = 0; sent < size;) { int n = Math.min(buffer.length, size - sent); out.write(buffer, 0, n); sent += n; }
                }
            }
            int status = c.getResponseCode();
            if (status < 200 || status >= 300) throw new java.io.IOException("Speed test service unavailable");
            try (java.io.InputStream in = c.getInputStream()) {
                int n; while ((n = in.read(buffer)) != -1) {
                    received += n;
                    if (System.nanoTime() - start > 20_000_000_000L) throw new java.io.IOException("Speed test timed out");
                }
            }
            return new Sample(upload ? size : received, System.nanoTime() - start);
        } finally { c.disconnect(); }
    }
}