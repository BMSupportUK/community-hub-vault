package uk.bmsupport.player;

/** Single-owner stream transfer; expired or mismatched offers release their connection. */
final class VlcHandoff<T extends AutoCloseable> {
    static final long MAX_AGE_MS = 5000;
    private T stream;
    private String id;
    private long offeredAt;

    synchronized void offer(T value, String channel, long now) {
        drop(); stream = value; id = channel; offeredAt = now;
    }

    synchronized T take(String channel, long now) {
        if (stream == null || id == null || !id.equals(channel) || now < offeredAt || now - offeredAt > MAX_AGE_MS) {
            drop(); return null;
        }
        T value = stream; stream = null; id = null; return value;
    }

    synchronized void drop() {
        if (stream != null) { try { stream.close(); } catch (Exception ignored) {} }
        stream = null; id = null;
    }
}