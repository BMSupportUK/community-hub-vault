package uk.bmsupport.player;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class)
public class SportsChannelListingsTest {
    @Test public void emptySportsPassIsNotShown() throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        JSONObject event = new JSONObject("{\"title\":\"Leeds v Tottenham\",\"channels\":[\"Sky Sports Football\",\"DAZN 12\",\"\"],\"passChannels\":[\"DAZN 12\",\"\"]}");
        MainActivity.Item channel = new MainActivity.Item("live", "42", "Sky Sports Football HD", "ts", "sports");
        List<String> labels = new ArrayList<>(); List<MainActivity.Item> targets = new ArrayList<>();
        activity.buildSportsRows(event, Collections.emptyList(), Collections.singletonList(channel), labels, targets);
        assertTrue(targets.contains(channel));
        assertFalse(labels.stream().anyMatch(s -> s.contains("SPORTS PASSES") || s.contains("DAZN 12")));
        assertEquals(labels.size(), targets.size());
    }
    @Test public void populatedDaysKeepSelectionOrChooseFirstEventDay() {
        assertEquals(2, MainActivity.populatedSportsDay(new int[]{0, 0, 3, 0, 1, 0, 0}, 0));
        assertEquals(4, MainActivity.populatedSportsDay(new int[]{0, 0, 3, 0, 1, 0, 0}, 4));
    }
    @Test public void announcementIconHiddenOnlyOnSportsScreens() throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        java.lang.reflect.Field screen = MainActivity.class.getDeclaredField("screen"); screen.setAccessible(true);
        screen.set(activity, "sports"); assertFalse(activity.showsAnnouncementIcon());
        screen.set(activity, "sports_channels"); assertFalse(activity.showsAnnouncementIcon());
        screen.set(activity, "home"); assertTrue(activity.showsAnnouncementIcon());
        screen.set(activity, "guide"); assertTrue(activity.showsAnnouncementIcon());
    }
    @Test public void rightEntersChannelsAndLeftReturnsToFixture() throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        android.widget.LinearLayout root = new android.widget.LinearLayout(activity);
        android.widget.ListView fixtures = new android.widget.ListView(activity), channels = new android.widget.ListView(activity);
        fixtures.setAdapter(new android.widget.ArrayAdapter<>(activity, android.R.layout.simple_list_item_1, new String[]{"Fixture"}));
        channels.setAdapter(new android.widget.ArrayAdapter<>(activity, android.R.layout.simple_list_item_1, new String[]{"Sky Sports Football"}));
        root.addView(fixtures, new android.widget.LinearLayout.LayoutParams(400, 300)); root.addView(channels, new android.widget.LinearLayout.LayoutParams(400, 300)); activity.setContentView(root);
        for (String name : new String[]{"screen", "sportsList", "sportsChannelList"}) {
            java.lang.reflect.Field f = MainActivity.class.getDeclaredField(name); f.setAccessible(true);
            f.set(activity, name.equals("screen") ? "sports" : name.equals("sportsList") ? fixtures : channels);
        }
        fixtures.requestFocus(); assertTrue(fixtures.hasFocus());
        assertTrue(activity.dispatchKeyEvent(new android.view.KeyEvent(0, android.view.KeyEvent.KEYCODE_DPAD_RIGHT)));
        assertTrue(channels.hasFocus());
        assertTrue(activity.dispatchKeyEvent(new android.view.KeyEvent(0, android.view.KeyEvent.KEYCODE_DPAD_LEFT)));
        assertTrue(fixtures.hasFocus());
    }
    @Test public void premierLeagueGameProvidesPlayableListedChannel() throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        JSONObject event = new JSONObject("{\"sport\":\"Football\",\"subcategory\":\"Mens\",\"competition\":\"English Premier League TV Channels\",\"title\":\"Leeds United v Tottenham Hotspur\",\"channels\":[\"Sky Sports Football\"],\"passChannels\":[]}");
        MainActivity.Item channel = new MainActivity.Item("live", "42", "Sky Sports Football HD", "ts", "sports");
        List<String> labels = new ArrayList<>();
        List<MainActivity.Item> targets = new ArrayList<>();
        activity.buildSportsRows(event, Collections.emptyList(), Collections.singletonList(channel), labels, targets);
        assertTrue("listed channel must provide a playable target", targets.contains(channel));
        assertEquals("listing and targets must stay aligned", labels.size(), targets.size());
        assertFalse("available channel must not be marked missing", labels.stream().anyMatch(s -> s.startsWith("✕")));
    }
}