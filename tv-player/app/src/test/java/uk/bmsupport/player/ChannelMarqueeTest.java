package uk.bmsupport.player;
import org.junit.Test;
import static org.junit.Assert.*;
public class ChannelMarqueeTest {
    @Test public void shortNamesNeverMove() { assertEquals(0, ChannelMarquee.offset(100,200,5000,1),0.01f); }
    @Test public void longNamePausesThenRevealsItsEnd() {
        assertEquals(0,ChannelMarquee.offset(400,200,1500,1),0.01f);
        assertEquals(30,ChannelMarquee.offset(400,200,2500,1),0.01f);
        assertEquals(200,ChannelMarquee.offset(400,200,8500,1),0.01f);
        assertTrue(ChannelMarquee.offset(400,200,11000,1)<200);
    }
}