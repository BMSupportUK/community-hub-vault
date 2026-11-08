package uk.bmsupport.player;
final class ChannelMarquee {
    private ChannelMarquee() {}
    static float offset(float width, float available, long elapsed, float density) {
        if (width <= available || elapsed <= 1500) return 0;
        float distance = width - available;
        long travel = (long) Math.ceil(distance / (30 * density) * 1000);
        long phase = (elapsed - 1500) % (travel * 2 + 3000);
        if (phase <= travel) return Math.min(distance, phase * 30 * density / 1000f);
        if (phase <= travel + 1500) return distance;
        return Math.max(0, distance - (phase - travel - 1500) * 30 * density / 1000f);
    }
}