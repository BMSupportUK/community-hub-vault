package uk.bmsupport.player;

/** VLC has a fixed network cache, not Media3's min/max load control. */
final class BackupBufferPolicy {
    private BackupBufferPolicy() {}
    /** Guide previews start fast; the full-screen buffer setting (up to 60s) would hold the picture back. */
    static int previewCacheMs() { return 1500; }

    static int networkCacheMs(boolean live, String setting, String name) {
        return live ? Math.min(60000, StreamRecovery.bufferMs(setting, name)[0]) : 3000;
    }
}