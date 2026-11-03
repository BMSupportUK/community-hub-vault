package uk.bmsupport.player;

import android.content.Context;
import android.content.res.Configuration;
import android.util.DisplayMetrics;

/** Phones are much shorter than a TV when sideways; shrink the density so the TV-shaped layout fits instead of being cut off. */
final class PhoneScale {
    /** A 1080p TV is about 540dp tall; phones in landscape are ~320-420dp. */
    static final int TARGET_SHORT_DP = 540;

    static int scaledDpi(int densityDpi, int shortPx) {
        if (densityDpi <= 0 || shortPx <= 0) return densityDpi;
        float shortDp = shortPx * 160f / densityDpi;
        if (shortDp >= 500) return densityDpi; // TVs, tablets: untouched
        return Math.max(100, Math.round(shortPx * 160f / TARGET_SHORT_DP));
    }

    static Context wrap(Context base) {
        DisplayMetrics m = base.getResources().getDisplayMetrics();
        int shortPx = Math.min(m.widthPixels, m.heightPixels);
        Configuration c = new Configuration(base.getResources().getConfiguration());
        int dpi = scaledDpi(c.densityDpi, shortPx);
        if (dpi == c.densityDpi) return base;
        c.densityDpi = dpi;
        int s = Math.round(shortPx * 160f / dpi);
        c.smallestScreenWidthDp = s;
        c.screenHeightDp = s;
        c.screenWidthDp = Math.round(Math.max(m.widthPixels, m.heightPixels) * 160f / dpi);
        return base.createConfigurationContext(c);
    }

    private PhoneScale() {}
}
