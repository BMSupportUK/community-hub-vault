package uk.bmsupport.player;

/** VLC has a fixed network cache, not Media3's min/max load control. */
final class BackupBufferPolicy {
    private BackupBufferPolicy() {}
    static int networkCacheMs(boolean live, String setting, String name) {
        return live ? Math.min(60000, StreamRecovery.bufferMs(setting, name)[0]) : 3000;
    }
}