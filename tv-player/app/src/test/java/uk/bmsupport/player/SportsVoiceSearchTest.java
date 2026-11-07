package uk.bmsupport.player;
import static org.junit.Assert.*;
import org.junit.Test;

public class SportsVoiceSearchTest {
    @Test public void spokenBkfcWithPunctuationAndFillerFindsEvent() {
        assertTrue(SportsVoiceSearch.matches("BKFC 96: Cooke v Weir", "BKFC."));
        assertTrue(SportsVoiceSearch.matches("BKFC 96: Cooke v Weir", "Show me BKFC"));
    }
    @Test public void spacedMotoGpFindsJoinedEventName() {
        assertTrue(SportsVoiceSearch.matches("MotoGP: Round 20: Qatar Sprint Race", "Moto GP"));
    }
    @Test public void footballMatchesVersusAndTonightButNotOtherTeams() {
        assertTrue(SportsVoiceSearch.matches("Derby County v Bolton Wanderers", "Derby versus Bolton"));
        assertTrue(SportsVoiceSearch.matches("Derby County v Bolton Wanderers", "the Derby game tonight"));
        assertFalse(SportsVoiceSearch.matches("Derby County v Bolton Wanderers", "Chelsea"));
        assertFalse(SportsVoiceSearch.matches("Derby County v Bolton Wanderers", "show me the sports guide"));
    }
}