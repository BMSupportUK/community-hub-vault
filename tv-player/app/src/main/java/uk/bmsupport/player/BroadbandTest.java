package uk.bmsupport.player;

/** User-requested, bounded Cloudflare tests. Traffic counters are not line speed. */
final class BroadbandTest {
    static final int[] SIZES = {1_000_000, 5_000_000, 20_000_000, 50_000_000};
    interface Transfer { Sample run(boolean upload, int bytes) throws Exception; }
    static final class Sample {
        final long bytes, nanos; final boolean capped;
        Sample(long bytes, long nanos) { this(bytes, nanos, false); }
        Sample(long bytes, long nanos, boolean capped) { this.bytes = bytes; this.nanos = nanos; this.capped = capped; }
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
    /** Slow lines hit the time cap and still give a real reading from what moved; one failed sample never voids the test. */
    static int measure(boolean upload, Transfer transfer) throws Exception {
        int best = -1; Exception last = null;
        for (int size : SIZES) {
            java.util.List<Long> rates = new java.util.ArrayList<>(), times = new java.util.ArrayList<>();
            for (int i = 0; i < 3; i++) {
                try {
                    Sample s = transfer.run(upload, size);
                    if (s.bytes != size && !(s.capped && s.bytes >= 250_000)) throw new java.io.IOException("Incomplete speed test");
                    rates.add((long) rate(s.bytes, s.nanos)); times.add(s.capped ? CAP_NANOS : s.nanos);
                } catch (java.io.InterruptedIOException e) { throw e; } catch (Exception e) { last = e; }
            }
            if (rates.isEmpty()) break;
            best = (int) median(toArray(rates));
            if (median(toArray(times)) >= 1_000_000_000L) break;
        }
        if (best < 0) throw last != null ? last : new java.io.IOException("Speed test failed");
        return best;
    }
    static final long CAP_NANOS = 8_000_000_000L;
    private static long[] toArray(java.util.List<Long> l) { long[] a = new long[l.size()]; for (int i = 0; i < a.length; i++) a[i] = l.get(i); return a; }
    static Result run() throws Exception {
        Transfer transfer = BroadbandTest::transfer;
        try { transfer.run(false, 0); } catch (Exception ignored) {} // Warm up DNS/TLS before measuring latency.
        java.util.List<Long> lat = new java.util.ArrayList<>();
        for (int i = 0; i < 5; i++) try { lat.add(transfer.run(false, 0).nanos); } catch (java.io.InterruptedIOException e) { throw e; } catch (Exception ignored) {}
        long[] latency = lat.isEmpty() ? new long[]{0} : toArray(lat);
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
                    for (int sent = 0; sent < size;) {
                        if (System.nanoTime() - start > CAP_NANOS) { long t = System.nanoTime() - start; c.disconnect(); return new Sample(sent, t, true); }
                        int n = Math.min(buffer.length, size - sent); out.write(buffer, 0, n); sent += n;
                    }
                }
            }
            int status = c.getResponseCode();
            if (status < 200 || status >= 300) throw new java.io.IOException("Speed test service unavailable");
            try (java.io.InputStream in = c.getInputStream()) {
                int n; while ((n = in.read(buffer)) != -1) {
                    received += n;
                    if (System.nanoTime() - start > CAP_NANOS) return new Sample(received, System.nanoTime() - start, true);
                }
            }
            return new Sample(upload ? size : received, System.nanoTime() - start);
        } finally { c.disconnect(); }
    }
}