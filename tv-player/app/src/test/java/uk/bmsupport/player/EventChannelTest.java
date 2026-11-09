package uk.bmsupport.player;
import org.junit.Test;
import static org.junit.Assert.*;
public class EventChannelTest {
 @Test public void feedNumberSurvivesFiltering(){assertEquals("08",EventChannel.label("08 | 09:30 FIA WEC ",2));}
 @Test public void ordinaryLabelsUnchanged(){assertEquals("3  Sky Sports F1",EventChannel.label("Sky Sports F1",2));}
 @Test public void leadingTimeBecomesProgrammeStart(){GuideGridView.Prog p=EventChannel.programme("08 | 09:30 FIA WEC ",1794211200L);assertEquals("FIA WEC",p.title);assertEquals(1794216600L,p.st);}
 @Test public void trailingTimeKeepsEventNumbers(){GuideGridView.Prog p=EventChannel.programme("18 | OKTAGON 97: Severino vs. Holzer 17:00",1794211200L);assertEquals("OKTAGON 97: Severino vs. Holzer",p.title);assertEquals(1794243600L,p.st);}
 @Test public void summerClockIsUK(){GuideGridView.Prog p=EventChannel.programme("01 | 12:00 Trackside Live!",1782892800L);assertEquals(1782903600L,p.st);}
 @Test public void noInventedStart(){assertNull(EventChannel.programme("21 | ",1794211200L));assertNull(EventChannel.programme("07 | Live Cycling",1794211200L));}
}