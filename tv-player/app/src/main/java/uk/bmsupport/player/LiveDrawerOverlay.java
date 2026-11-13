package uk.bmsupport.player;

import android.app.Activity;
import android.graphics.Typeface;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;

/**
 * The guide's category/channel drawer slid over a full-screen picture (main player and backup
 * engine alike). Picking another channel sets LiveDrawerData.pendingPick and finishes the
 * activity so the main screen opens it through the normal playback path.
 */
final class LiveDrawerOverlay {
    private final Activity a;
    private final FrameLayout root;
    private final String currentId;
    private View scrim;
    private LinearLayout panel;
    boolean shown;

    LiveDrawerOverlay(Activity a, FrameLayout root, String currentId) { this.a = a; this.root = root; this.currentId = currentId; }

    void show() {
        if (root == null || shown || !LiveDrawerData.ready()) return;
        shown = true;
        final float d = a.getResources().getDisplayMetrics().density;
        final int w = (int) (300 * d);
        scrim = new View(a);
        scrim.setBackgroundColor(0x99000000);
        scrim.setClickable(true);
        scrim.setOnClickListener(v -> hide());
        root.addView(scrim, new FrameLayout.LayoutParams(-1, -1));
        panel = new LinearLayout(a);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setBackgroundColor(0xFF0B1220);
        panel.setPadding((int) (18 * d), (int) (24 * d), (int) (18 * d), (int) (16 * d));
        TextView title = new TextView(a);
        title.setText("Categories"); title.setTextSize(22); title.setTextColor(0xFFFFFFFF);
        title.setTypeface(Typeface.DEFAULT_BOLD); title.setPadding(0, (int) (6 * d), 0, (int) (6 * d));
        panel.addView(title);
        final java.util.List<String[]> cats = LiveDrawerData.categories();
        final LiveDrawerData.Channel current = LiveDrawerData.find(currentId);
        final ListView catList = new ListView(a);
        catList.setDivider(new android.graphics.drawable.ColorDrawable(0x1FFFFFFF));
        catList.setDividerHeight(1);
        catList.setFocusable(true);
        java.util.List<String> catNames = new java.util.ArrayList<>();
        for (String[] c : cats) catNames.add((current != null && c[0].equals(current.categoryId) ? "✓ " : "") + c[1]);
        catList.setAdapter(new android.widget.ArrayAdapter<String>(a, android.R.layout.simple_list_item_1, catNames) {
            @Override public View getView(int position, View recycled, android.view.ViewGroup parent) {
                ChannelNameView label = recycled instanceof ChannelNameView ? (ChannelNameView) recycled : new ChannelNameView(a);
                label.setText(getItem(position)); label.setTextSize(17); label.setTextColor(0xFFFFFFFF);
                int p = (int) (12 * d); label.setPadding(p, p, p, p);
                return label;
            }
        });
        @SuppressWarnings("unchecked")
        final java.util.List<LiveDrawerData.Channel>[] list = new java.util.List[1];
        final LiveChannelDrawer drawer = new LiveChannelDrawer(a, catList, pos -> {
            if (list[0] == null || pos < 0 || pos >= list[0].size()) return;
            LiveDrawerData.Channel ch = list[0].get(pos);
            if (currentId != null && currentId.equals(ch.id)) { hide(); return; }
            LiveDrawerData.pendingPick = ch.id;
            a.finish();
        });
        panel.addView(drawer, new LinearLayout.LayoutParams(-1, 0, 1));
        catList.setOnItemClickListener((p, v, pos, id) -> {
            if (pos >= cats.size()) return;
            list[0] = LiveDrawerData.channelsIn(cats.get(pos)[0]);
            java.util.List<String> names = new java.util.ArrayList<>();
            int sel = 0;
            for (int i = 0; i < list[0].size(); i++) {
                names.add(list[0].get(i).name);
                if (currentId != null && currentId.equals(list[0].get(i).id)) sel = i;
            }
            drawer.showChannels(names, sel);
        });
        android.widget.Button close = new android.widget.Button(a);
        close.setText("Close");
        close.setOnClickListener(v -> hide());
        panel.addView(close);
        panel.setTranslationX(-w);
        root.addView(panel, new FrameLayout.LayoutParams(w, -1));
        panel.animate().translationX(0f).setDuration(220).start();
        catList.requestFocus();
    }

    void hide() {
        if (!shown) return;
        shown = false;
        if (scrim != null) { root.removeView(scrim); scrim = null; }
        if (panel != null) {
            final LinearLayout p = panel; panel = null;
            p.animate().translationX(-p.getWidth()).setDuration(180).withEndAction(() -> root.removeView(p)).start();
        }
    }

    static boolean tvBox(Activity a) {
        return "Amazon".equalsIgnoreCase(android.os.Build.MANUFACTURER)
                || a.getPackageManager().hasSystemFeature(android.content.pm.PackageManager.FEATURE_LEANBACK);
    }
}
