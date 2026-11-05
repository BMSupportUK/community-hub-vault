package uk.bmsupport.player;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ListView;
import java.util.List;
import java.util.function.IntConsumer;

/** Two sliding levels inside the existing left-edge drawer. */
final class LiveChannelDrawer extends LinearLayout {
    private final ListView categories;
    private final LinearLayout channels;
    private final ListView channelList;

    LiveChannelDrawer(Context context, ListView categoryList, IntConsumer pickChannel) {
        super(context);
        setOrientation(VERTICAL);
        categories = categoryList;
        addView(categories, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        channels = new LinearLayout(context);
        channels.setOrientation(VERTICAL);
        channels.setVisibility(GONE);
        Button back = new Button(context);
        back.setText("‹ Categories");
        back.setOnClickListener(v -> showCategories());
        channels.addView(back);
        channelList = new ListView(context);
        channelList.setOnItemClickListener((p, v, position, id) -> pickChannel.accept(position));
        channels.addView(channelList, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        addView(channels, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
    }

    void showChannels(List<String> names) {
        channelList.setAdapter(new ArrayAdapter<>(getContext(), android.R.layout.simple_list_item_1, names));
        categories.setVisibility(GONE);
        slideIn(channels);
        channelList.setSelection(0);
        channelList.requestFocus();
    }

    void showCategories() {
        channels.setVisibility(GONE);
        slideIn(categories);
        categories.requestFocus();
    }

    private void slideIn(View view) {
        view.animate().cancel();
        view.setVisibility(VISIBLE);
        view.setTranslationX(-300 * getResources().getDisplayMetrics().density);
        view.animate().translationX(0).setDuration(220).start();
    }
}