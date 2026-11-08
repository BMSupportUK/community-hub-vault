package uk.bmsupport.player;
import org.junit.Test;
import static org.junit.Assert.*;
public class LiveSearchTest {
    @Test public void skySportsIncludesNewZealandSingularSport() {
        assertTrue(LiveSearch.matches("NZ | Sky Sport 1 HD", "sky sports"));
        assertTrue(LiveSearch.matches("UK | Sky Sports Main Event", "Sky Sports"));
        assertFalse(LiveSearch.matches("NZ | Sky News", "sky sports"));
    }
    @Test public void punctuationAndCaseDoNotHideChannels() {
        assertTrue(LiveSearch.matches("NZ | SKY-SPORT 2", "Sky Sports 2"));
        assertFalse(LiveSearch.matches("NZ | Sky Sport 1", "Sky Sports 2"));
        assertTrue(LiveSearch.matches("NZ | Sky Sport 1", ""));
    }
}