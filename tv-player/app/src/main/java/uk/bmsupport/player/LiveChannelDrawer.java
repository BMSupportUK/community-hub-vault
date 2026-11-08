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
        channelList.setAdapter(new ArrayAdapter<String>(getContext(), android.R.layout.simple_list_item_1, names) {
            @Override public View getView(int position, View recycled, ViewGroup parent) {
                ChannelNameView label = recycled instanceof ChannelNameView ? (ChannelNameView) recycled : new ChannelNameView(getContext());
                label.setText(getItem(position)); label.setTextSize(17);
                int padding = (int) (12 * getResources().getDisplayMetrics().density);
                label.setPadding(padding, padding, padding, padding);
                label.setSelected(position == channelList.getSelectedItemPosition());
                return label;
            }
        });
        channelList.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
                for (int i = 0; i < parent.getChildCount(); i++) ChannelNameView.activate(parent.getChildAt(i), parent.getChildAt(i) == view);
            }
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) {
                for (int i = 0; i < parent.getChildCount(); i++) ChannelNameView.activate(parent.getChildAt(i), false);
            }
        });
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