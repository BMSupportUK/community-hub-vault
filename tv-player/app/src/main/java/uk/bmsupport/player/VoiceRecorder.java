package uk.bmsupport.player;

/** BM Player's own microphone capture for voice search on boxes without a usable speech service (Fire TV). */
final class VoiceRecorder {
    static final int RATE = 16_000, MAX_MS = 8_000, SILENCE_MS = 1_200, SPEECH_LEVEL = 600, FLAT_LEVEL = 40;
    interface Listener { void level(int rms); }
    private volatile boolean stop;
    void stop() { stop = true; }

    /** Result of one take: the WAV, the loudest level heard and whether anyone spoke. */
    static final class Take {
        final byte[] wav; final int peak; final boolean heardSpeech;
        Take(byte[] wav, int peak, boolean heardSpeech) { this.wav = wav; this.peak = peak; this.heardSpeech = heardSpeech; }
        /** No sound at all reached the app: this box doesn't hand its microphone to apps. */
        boolean flat() { return peak < FLAT_LEVEL; }
    }

    static int rms(short[] s, int n) {
        if (n <= 0) return 0;
        double sum = 0; for (int i = 0; i < n; i++) sum += (double) s[i] * s[i];
        return (int) Math.sqrt(sum / n);
    }

    /** Ends after speech then a pause, or at the cap. */
    static boolean finished(boolean heard, long silentMs, long elapsedMs) {
        return elapsedMs >= MAX_MS || (heard && silentMs >= SILENCE_MS);
    }

    static byte[] wav(byte[] pcm, int rate) {
        java.nio.ByteBuffer b = java.nio.ByteBuffer.allocate(44 + pcm.length).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        b.put("RIFF".getBytes()).putInt(36 + pcm.length).put("WAVE".getBytes()).put("fmt ".getBytes())
                .putInt(16).putShort((short) 1).putShort((short) 1).putInt(rate).putInt(rate * 2)
                .putShort((short) 2).putShort((short) 16).put("data".getBytes()).putInt(pcm.length).put(pcm);
        return b.array();
    }

    @android.annotation.SuppressLint("MissingPermission")
    Take record(Listener listener) throws Exception {
        int min = android.media.AudioRecord.getMinBufferSize(RATE, android.media.AudioFormat.CHANNEL_IN_MONO, android.media.AudioFormat.ENCODING_PCM_16BIT);
        int size = Math.max(min, RATE / 5);
        android.media.AudioRecord rec = null;
        for (int src : new int[]{android.media.MediaRecorder.AudioSource.VOICE_RECOGNITION, android.media.MediaRecorder.AudioSource.MIC}) {
            try {
                rec = new android.media.AudioRecord(src, RATE, android.media.AudioFormat.CHANNEL_IN_MONO, android.media.AudioFormat.ENCODING_PCM_16BIT, size * 2);
                if (rec.getState() == android.media.AudioRecord.STATE_INITIALIZED) break;
                rec.release(); rec = null;
            } catch (Exception e) { rec = null; }
        }
        if (rec == null) throw new java.io.IOException("No microphone available");
        java.io.ByteArrayOutputStream pcm = new java.io.ByteArrayOutputStream();
        short[] buf = new short[RATE / 10];
        long start = android.os.SystemClock.elapsedRealtime(), lastLoud = start; boolean heard = false; int peak = 0;
        try {
            rec.startRecording();
            while (!stop) {
                int n = rec.read(buf, 0, buf.length);
                if (n < 0) throw new java.io.IOException("Microphone stopped");
                long now = android.os.SystemClock.elapsedRealtime();
                int level = rms(buf, n); peak = Math.max(peak, level);
                if (level >= SPEECH_LEVEL) { heard = true; lastLoud = now; }
                for (int i = 0; i < n; i++) { pcm.write(buf[i] & 0xff); pcm.write((buf[i] >> 8) & 0xff); }
                if (listener != null) listener.level(level);
                if (finished(heard, now - lastLoud, now - start)) break;
            }
        } finally { try { rec.stop(); } catch (Exception ignored) {} rec.release(); }
        return new Take(wav(pcm.toByteArray(), RATE), peak, heard);
    }
}
