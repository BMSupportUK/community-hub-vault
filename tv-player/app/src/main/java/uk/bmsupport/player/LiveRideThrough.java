package uk.bmsupport.player;

/** Live TV ride-through rules for the libVLC engine: frozen picture with running sound, retry budget, audio track keep. */
final class LiveRideThrough {
    static final long FROZEN_MS = 4000, STABLE_MS = 30000;
    static final int MAX_FREEZE_REOPENS = 3;
    private long lastPics = -1, lastAudio = -1, stuckSince = -1, playingSince = -1;
    int freezeReopens;

    /** Feed one stats sample; true once pictures stop for 4s while audio keeps decoding. */
    boolean frozen(long pictures, long audio, long now) {
        boolean audioMoving = lastAudio >= 0 && audio > lastAudio;
        boolean picsStill = lastPics >= 0 && pictures <= lastPics;
        lastPics = pictures; lastAudio = audio;
        if (picsStill && audioMoving) { if (stuckSince < 0) stuckSince = now; }
        else if (!picsStill) stuckSince = -1;
        return stuckSince >= 0 && now - stuckSince >= FROZEN_MS;
    }

    /** True if another quiet same-engine reopen is allowed for a frozen picture. */
    boolean allowFreezeReopen() { resetSamples(); return ++freezeReopens <= MAX_FREEZE_REOPENS; }

    void resetSamples() { lastPics = -1; lastAudio = -1; stuckSince = -1; }

    void playing(long now) { if (playingSince < 0) playingSince = now; }
    void stopped() { playingSince = -1; }
    /** After 30s of steady playback, an advert-break drop gets a fresh retry budget. */
    boolean stable(long now) { return playingSince >= 0 && now - playingSince >= STABLE_MS; }

    /** Re-find the chosen audio track by name after the sound format changes; -1 keeps the default. */
    static int pickAudio(int[] ids, String[] names, String wanted) {
        if (wanted == null || ids == null || names == null) return -1;
        for (int i = 0; i < ids.length && i < names.length; i++) if (wanted.equals(names[i])) return ids[i];
        String lang = wanted.split("[ \\-\\[]")[0].toLowerCase();
        if (!lang.isEmpty()) for (int i = 0; i < ids.length && i < names.length; i++)
            if (names[i] != null && names[i].toLowerCase().startsWith(lang)) return ids[i];
        return -1;
    }
}
