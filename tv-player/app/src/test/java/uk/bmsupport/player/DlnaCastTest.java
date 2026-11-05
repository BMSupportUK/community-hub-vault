package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class DlnaCastTest {
    @Test public void findsAvTransportControlUrl() throws Exception {
        String xml = "<root><device><friendlyName>Living Room TV</friendlyName><serviceList>"
            + "<service><serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType><controlURL>/rc</controlURL></service>"
            + "<service><serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType><controlURL>/upnp/control/AVTransport1</controlURL></service>"
            + "</serviceList></device></root>";
        DlnaCast.Tv tv = DlnaCast.describe("http://192.168.1.20:9197/dmr", xml);
        assertEquals("Living Room TV", tv.name);
        assertEquals("http://192.168.1.20:9197/upnp/control/AVTransport1", tv.controlUrl);
    }
    @Test public void noAvTransportMeansNotCastable() throws Exception {
        assertNull(DlnaCast.describe("http://1.2.3.4/", "<service><serviceType>x:ContentDirectory:1</serviceType><controlURL>/c</controlURL></service>"));
    }
    @Test public void readsLocationHeader() {
        assertEquals("http://10.0.0.5:1400/desc.xml", DlnaCast.header("HTTP/1.1 200 OK\r\nlocation: http://10.0.0.5:1400/desc.xml\r\n", "LOCATION"));
    }
}
