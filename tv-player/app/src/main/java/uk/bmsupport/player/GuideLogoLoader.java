package uk.bmsupport.player;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Provider channel logos for the TV guide channel column. Shares the poster disk cache with the
 * rest of the app so a logo already fetched for a favourite or recently-watched card is instant.
 * Loads happen off the main thread; the grid is told to redraw when a logo arrives.
 */
public final class GuideLogoLoader {
    public interface Ready { void onLogo(String url); }

    private static final LruCache<String, Bitmap> MEM = new LruCache<String, Bitmap>(8 * 1024 * 1024) {
        @Override protected int sizeOf(String k, Bitmap b) { return b.getByteCount(); }
    };
    private static final Map<String, Long> FAILED = new HashMap<>();
    private static final Set<String> IN_FLIGHT = new HashSet<>();
    private static final ExecutorService IO = Executors.newFixedThreadPool(2);
    private static final Handler UI = new Handler(Looper.getMainLooper());

    private GuideLogoLoader() {}

    /** Cached logo, or null (a load is started and ready is called when it lands). */
    public static Bitmap get(Context ctx, String url, Ready ready) {
        if (url == null || !url.startsWith("http")) return null;
        Bitmap b = MEM.get(url);
        if (b != null) return b;
        Long f = FAILED.get(url);
        if (f != null && System.currentTimeMillis() - f < 60_000) return null;
        synchronized (IN_FLIGHT) {
            if (IN_FLIGHT.contains(url)) return null;
            IN_FLIGHT.add(url);
        }
        final File dir = new File(ctx.getCacheDir(), "posters");
        IO.execute(() -> {
            Bitmap done = null;
            try {
                dir.mkdirs();
                File file = new File(dir, Integer.toHexString(url.hashCode()) + "_" + url.length() + ".img");
                byte[] data = null;
                if (file.exists() && file.length() > 0) {
                    try (FileInputStream in = new FileInputStream(file); ByteArrayOutputStream bo = new ByteArrayOutputStream()) {
                        byte[] buf = new byte[16384]; int n; while ((n = in.read(buf)) > 0) bo.write(buf, 0, n); data = bo.toByteArray();
                    } catch (Exception ignored) { data = null; }
                }
                if (data == null) {
                    HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
                    h.setConnectTimeout(8000); h.setReadTimeout(10000); h.setInstanceFollowRedirects(true);
                    h.setRequestProperty("User-Agent", "VLC/3.0.20 LibVLC/3.0.20");
                    try (InputStream in = h.getInputStream(); ByteArrayOutputStream bo = new ByteArrayOutputStream()) {
                        byte[] buf = new byte[16384]; int n; while ((n = in.read(buf)) > 0) bo.write(buf, 0, n); data = bo.toByteArray();
                    }
                    if (file.length() == 0) {
                        try (FileOutputStream out = new FileOutputStream(file)) { out.write(data); } catch (Exception ignored) {}
                    }
                }
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inJustDecodeBounds = true; BitmapFactory.decodeByteArray(data, 0, data.length, o);
                int s = 1; while (o.outHeight / (s * 2) >= 96) s *= 2;
                o = new BitmapFactory.Options(); o.inSampleSize = s; o.inPreferredConfig = Bitmap.Config.ARGB_8888;
                done = BitmapFactory.decodeByteArray(data, 0, data.length, o);
            } catch (Exception ignored) {}
            synchronized (IN_FLIGHT) { IN_FLIGHT.remove(url); }
            final Bitmap result = done;
            UI.post(() -> {
                if (result == null) { FAILED.put(url, System.currentTimeMillis()); return; }
                FAILED.remove(url);
                MEM.put(url, result);
                if (ready != null) ready.onLogo(url);
            });
        });
        return null;
    }

    /** Rectangle a logo occupies inside a channel cell: square, vertically centred, at the left edge. */
    public static android.graphics.RectF slot(float cellLeft, float cellTop, float rowH, float d) {
        float[] s = GuideLogoFit.slot(cellLeft, cellTop, rowH, d);
        return new android.graphics.RectF(s[0], s[1], s[2], s[3]);
    }

    /** Fit a bitmap inside the slot keeping its shape (logos are never cropped or stretched). */
    public static android.graphics.RectF fit(Bitmap b, android.graphics.RectF slot) {
        float[] f = GuideLogoFit.fit(b.getWidth(), b.getHeight(), new float[]{slot.left, slot.top, slot.right, slot.bottom});
        return new android.graphics.RectF(f[0], f[1], f[2], f[3]);
    }
}
