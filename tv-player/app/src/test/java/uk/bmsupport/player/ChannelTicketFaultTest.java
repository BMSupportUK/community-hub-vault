package uk.bmsupport.player;
import static org.junit.Assert.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.json.JSONArray;
import org.json.JSONObject;
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class)
public class ChannelTicketFaultTest {
    @Test public void faultIdentityMatchesOnlyReportedChannel() throws Exception {
        JSONArray faults = new JSONArray().put(" SKY  Sports ");
        assertTrue(ChannelHealth.ticketFault(faults, "Other", "Sky Sports"));
        assertFalse(ChannelHealth.ticketFault(faults, "Other", "Sky Sports 2"));
    }
    @Test public void resolvedFaultDisappearsAndPlaybackHealthStaysIndependent() throws Exception {
        JSONObject event = new JSONObject().put("ticketFaults", new JSONArray()).put("unavailable", new JSONArray().put("Sky Sports"));
        assertFalse(ChannelHealth.ticketFault(event.getJSONArray("ticketFaults"), "Sky Sports", "Sky Sports"));
        assertTrue(ChannelHealth.crossed(event, "Sky Sports"));
    }
}