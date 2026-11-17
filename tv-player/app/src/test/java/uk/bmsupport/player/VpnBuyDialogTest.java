package uk.bmsupport.player;
import org.junit.Test;
import static org.junit.Assert.*;
public class VpnBuyDialogTest {
    @Test public void showsPenceAsPounds() { assertEquals("£4.99", VpnBuyDialog.price(499)); assertEquals("£0.50", VpnBuyDialog.price(50)); }
    @Test public void endDateInUkTime() { assertEquals("17 May 2027", VpnBuyDialog.endDay("2027-05-17T10:00:00.000Z")); }
}
