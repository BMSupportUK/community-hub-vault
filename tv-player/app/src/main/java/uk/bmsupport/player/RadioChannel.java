package uk.bmsupport.player;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;
import java.text.Normalizer;
import java.util.Locale;

/** Audio-only live stations: recovery watches sound/data, never a non-existent video picture. */
final class RadioChannel {
    private static final String ART_TAG = "bm_radio_studio_art";

    static boolean is(String name, String category) {
        return mentionsRadio(name) || mentionsRadio(category);
    }

    /** The Radio page lists only stations stored in a radio category, never radio-named channels elsewhere. */
    static boolean radioCategory(String category) { return mentionsRadio(category); }

    /** Radio has its own home-screen browser; it never occupies a television EPG row. */
    static boolean inTvGuide(String name, String category) {
        return !is(name, category);
    }

    private static boolean mentionsRadio(String value) {
        if (value == null) return false;
        String normal = Normalizer.normalize(value, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        return normal.matches(".*\\bradio\\b.*");
    }

    /** Keeps the playing audio surface underneath, with the same artwork in preview and full screen. */
    static ImageView installArt(Context context, ViewGroup host) {
        for (int i = 0; i < host.getChildCount(); i++) {
            View child = host.getChildAt(i);
            if (ART_TAG.equals(child.getTag()) && child instanceof ImageView) {
                child.setVisibility(View.VISIBLE);
                return (ImageView) child;
            }
        }
        ImageView art = new ImageView(context);
        art.setTag(ART_TAG);
        art.setImageResource(R.drawable.radio_studio);
        art.setScaleType(ImageView.ScaleType.CENTER_CROP);
        art.setContentDescription("Radio station DJ mixing songs in the studio");
        host.addView(art, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        return art;
    }

    /** A persistent station caption belongs to the full-screen activity, not its carried preview. */
    static void installStationName(Context context, FrameLayout host, String name) {
        if (name == null || name.trim().isEmpty()) return;
        float density = context.getResources().getDisplayMetrics().density;
        int inset = Math.round(32 * density);
        TextView station = new TextView(context);
        station.setText(name.trim());
        station.setTextSize(22);
        station.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        station.setTextColor(android.graphics.Color.WHITE);
        station.setPadding(Math.round(16 * density), Math.round(10 * density),
                Math.round(16 * density), Math.round(10 * density));
        station.setMaxLines(2);
        station.setEllipsize(android.text.TextUtils.TruncateAt.END);
        station.setFocusable(false);
        station.setClickable(false);
        android.graphics.drawable.GradientDrawable pill = new android.graphics.drawable.GradientDrawable();
        pill.setColor(android.graphics.Color.argb(204, 16, 18, 25));
        pill.setCornerRadius(8 * density);
        pill.setStroke(Math.round(2 * density), android.graphics.Color.rgb(235, 49, 84));
        station.setBackground(pill);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-2, -2,
                android.view.Gravity.TOP | android.view.Gravity.START);
        lp.leftMargin = inset;
        lp.rightMargin = inset;
        lp.topMargin = Math.round(72 * density);
        // Sit beside the artwork's ON AIR sign (right edge x≈440, centre y≈95 of the 1672x941 picture, centre-cropped).
        host.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> {
            int w = r - l, h = b - t;
            if (w <= 0 || h <= 0) return;
            float scale = Math.max(w / 1672f, h / 941f);
            float offX = (w - 1672f * scale) / 2f, offY = (h - 941f * scale) / 2f;
            int left = Math.max(inset, Math.round(offX + 470f * scale));
            int top = Math.max(Math.round(16 * density), Math.round(offY + 95f * scale - station.getHeight() / 2f));
            station.setMaxWidth(Math.max(Math.round(120 * density), w - left - inset));
            FrameLayout.LayoutParams cur = (FrameLayout.LayoutParams) station.getLayoutParams();
            if (cur.leftMargin != left || cur.topMargin != top) {
                cur.leftMargin = left;
                cur.topMargin = top;
                station.post(() -> station.setLayoutParams(cur));
            }
        });
        host.addView(station, lp);
    }

    /** The selected station's artwork also covers the short wait before the preview engine opens. */
    static void poster(View poster, String name, String category) {
        if (poster == null) return;
        int resource = is(name, category) ? R.drawable.radio_studio : R.drawable.preview_family;
        setImage(poster, resource);
    }

    private static void setImage(View view, int resource) {
        if (view instanceof ImageView) ((ImageView) view).setImageResource(resource);
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) setImage(group.getChildAt(i), resource);
        }
    }
}
