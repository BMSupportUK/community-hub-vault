package uk.bmsupport.player;
import android.content.Context;
import android.text.TextUtils;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
final class ChannelNameView extends TextView {
    ChannelNameView(Context context) {
        super(context); setSingleLine(true); setEllipsize(TextUtils.TruncateAt.MARQUEE);
        setMarqueeRepeatLimit(-1); setHorizontallyScrolling(true);
    }
    static void activate(View view, boolean selected) {
        if (view instanceof ChannelNameView) view.setSelected(selected);
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) activate(group.getChildAt(i), selected);
        }
    }
}