package uk.bmsupport.player;

/** Best guess at who caused a buffering stop: the channel's stream or the customer's own internet. */
final class BufferBlame {
    static final String STREAM = "stream", CUSTOMER = "customer", UNCLEAR = "unclear";
    static final long BROADBAND_FRESH_MS = 24L * 60 * 60 * 1000;
    /** Latest readings from the playing screen (ping to the channel server, channel kbps). */
    static volatile int pingMs = -1, channelKbps = -1;

    private BufferBlame() {}

    /** broadbandKbps <= 0 means no recent speed test. */
    static String judge(String cause, int ping, int channel, int broadbandKbps) {
        if ("audio_drop".equals(cause) || "provider_cut".equals(cause) || "advert_switch".equals(cause)) return STREAM;
        if (ping > 400) return CUSTOMER;
        if (broadbandKbps > 0 && channel > 0 && broadbandKbps < channel * 3 / 2) return CUSTOMER;
        if (ping > 0 && ping <= 200 && "network_drop".equals(cause)) return STREAM;
        return UNCLEAR;
    }

    static String current(android.content.Context c, String cause) {
        int bb = -1;
        try {
            android.content.SharedPreferences p = PlayerActivity.prefs(c);
            if (System.currentTimeMillis() - p.getLong("bb_at", 0) < BROADBAND_FRESH_MS) bb = p.getInt("bb_down", -1);
        } catch (Exception ignored) {}
        return judge(cause, pingMs, channelKbps, bb);
    }

    static String label(String blame) {
        return STREAM.equals(blame) ? "Likely cause: channel stream" : CUSTOMER.equals(blame) ? "Likely cause: your internet" : "Cause not clear yet";
    }
}
