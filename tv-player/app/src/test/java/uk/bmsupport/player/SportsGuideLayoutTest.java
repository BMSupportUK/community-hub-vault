package uk.bmsupport.player;

import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class, qualifiers = "w960dp-h540dp-mdpi")
public class SportsGuideLayoutTest {
    private void measureHeader(int width, int height) throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        for (String[] value : new String[][]{{"sportsSport", "Football"}, {"sportsSub", "Mens"}, {"sportsGuide", "English Premier League TV Channels"}}) {
            Field f = MainActivity.class.getDeclaredField(value[0]);
            f.setAccessible(true);
            f.set(activity, value[1]);
        }
        TextView status = new TextView(activity);
        status.setText("Updated 09:37");
        Method factory = MainActivity.class.getDeclaredMethod("sportsHeader", TextView.class);
        factory.setAccessible(true);
        LinearLayout header = (LinearLayout) factory.invoke(activity, status);
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.addView(header, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        View games = new View(activity);
        root.addView(games, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        root.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
        root.layout(0, 0, width, height);
        assertFalse(header.isBaselineAligned());
        assertTrue("header must not consume the games area: " + header.getHeight(), header.getHeight() < height / 4);
        assertTrue("games must retain most of the screen", games.getHeight() > height * 3 / 4);
        assertTrue("title must remain visible", header.getChildAt(0).getWidth() > 0);
        assertTrue("category must keep usable width", header.getChildAt(2).getWidth() > 0);
        assertTrue("last control must fit inside the screen", header.getChildAt(4).getRight() <= width);
    }

    @Test public void longPremierLeagueCategoryFitsTv() throws Exception { measureHeader(960, 540); }
    @Test public void longPremierLeagueCategoryFitsShortLandscape() throws Exception { measureHeader(800, 360); }

    private android.widget.ListView eventList(MainActivity activity) throws Exception {
        java.util.List<org.json.JSONObject> cards = new java.util.ArrayList<>();
        for (int i = 0; i < 12; i++) cards.add(new org.json.JSONObject()
                .put("title", "Middlesbrough v Coventry City " + i)
                .put("competition", "Championship").put("start", System.currentTimeMillis() + 60000)
                .put("channels", new org.json.JSONArray().put("Sky Sports")));
        Class<?> type = Class.forName("uk.bmsupport.player.MainActivity$SportsCardAdapter");
        java.lang.reflect.Constructor<?> constructor = type.getDeclaredConstructors()[0];
        constructor.setAccessible(true);
        android.widget.ListView list = new android.widget.ListView(activity);
        list.setPadding(6, 6, 6, 6);
        list.setAdapter((android.widget.BaseAdapter) constructor.newInstance(activity, cards, System.currentTimeMillis()));
        activity.setContentView(list);
        list.requestFocus();
        return list;
    }

    private void layoutList(android.widget.ListView list) {
        list.measure(View.MeasureSpec.makeMeasureSpec(430, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(230, View.MeasureSpec.EXACTLY));
        list.layout(0, 0, 430, 230);
    }

    @Test public void partiallyScrolledSelectedCardIsRevealedAtPaddedTop() throws Exception {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).get();
        android.widget.ListView list = eventList(a);
        list.setSelectionFromTop(4, -28);
        layoutList(list);
        assertEquals(4, list.getSelectedItemPosition());
        assertTrue("reproduce a clipped selected event", list.getSelectedView().getTop() < list.getPaddingTop());
        MainActivity.revealSportsCard(list);
        layoutList(list);
        assertEquals(4, list.getSelectedItemPosition());
        assertEquals(list.getPaddingTop(), list.getSelectedView().getTop());
        assertTrue(list.getSelectedView().getBottom() <= list.getHeight() - list.getPaddingBottom());
    }

    @Test public void fullyVisibleCardDoesNotResetListScroll() throws Exception {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).get();
        android.widget.ListView list = eventList(a);
        list.setSelectionFromTop(4, 20);
        layoutList(list);
        int top = list.getSelectedView().getTop();
        MainActivity.revealSportsCard(list);
        layoutList(list);
        assertEquals(top, list.getSelectedView().getTop());
        assertEquals(4, list.getSelectedItemPosition());
    }

    @Test public void eventContentsStayInsideFirstRow() throws Exception {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).get();
        Field prefs = MainActivity.class.getDeclaredField("prefs"); prefs.setAccessible(true);
        prefs.set(a, a.getSharedPreferences("bmplayer", 0));
        java.util.List<org.json.JSONObject> cards = new java.util.ArrayList<>();
        cards.add(new org.json.JSONObject().put("title", "Middlesbrough v Coventry City")
                .put("competition", "Championship").put("start", System.currentTimeMillis() + 60000)
                .put("channels", new org.json.JSONArray().put("Sky Sports")));
        Class<?> type = Class.forName("uk.bmsupport.player.MainActivity$SportsCardAdapter");
        java.lang.reflect.Constructor<?> constructor = type.getDeclaredConstructors()[0]; constructor.setAccessible(true);
        android.widget.BaseAdapter adapter = (android.widget.BaseAdapter) constructor.newInstance(a, cards, System.currentTimeMillis());
        LinearLayout card = (LinearLayout) adapter.getView(0, null, new LinearLayout(a));
        card.measure(View.MeasureSpec.makeMeasureSpec(430, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(300, View.MeasureSpec.AT_MOST));
        card.layout(0, 0, 430, card.getMeasuredHeight());
        assertFalse(card.isBaselineAligned());
        for (int i = 0; i < card.getChildCount(); i++) {
            View child = card.getChildAt(i);
            assertTrue("event content clipped at top", child.getTop() >= 0);
            assertTrue("event content clipped at bottom", child.getBottom() <= card.getHeight());
        }
    }
}