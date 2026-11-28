package uk.bmsupport.player;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import java.text.Normalizer;
import java.util.Locale;

/** Audio-only live stations: recovery watches sound/data, never a non-existent video picture. */
final class RadioChannel {
    private static final String ART_TAG = "bm_radio_studio_art";

    static boolean is(String name, String category) {
        return mentionsRadio(name) || mentionsRadio(category);
    }

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
