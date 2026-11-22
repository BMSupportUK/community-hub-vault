package uk.bmsupport.player;

/**
 * The ⛶ control drawn on the preview box. It only appears while the preview box actually has
 * something playing, and it opens the channel that preview is showing — never a channel the
 * highlight is merely sitting on.
 */
public final class PreviewFullIcon {
    private PreviewFullIcon() {}

    /** The icon is drawn only while the preview box is playing a channel. */
    public static boolean shows(boolean previewPlaying) {
        return previewPlaying;
    }

    /** Pressing the icon opens the previewed channel; nothing opens when no preview is up. */
    public static boolean opens(String previewItemId, boolean previewPlaying) {
        return previewPlaying && previewItemId != null;
    }
}
