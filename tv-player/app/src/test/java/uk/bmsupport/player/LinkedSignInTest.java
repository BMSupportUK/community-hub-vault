package uk.bmsupport.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class LinkedSignInTest {
    @Test public void alreadyLinkedAmazonOrAndroidRestoresSignIn() {
        assertTrue(LinkedSignIn.canRestore("verified-device-token", true, true));
    }
    @Test public void removedDeviceCannotRestore() {
        assertFalse(LinkedSignIn.canRestore("verified-device-token", false, true));
    }
    @Test public voidLogoutOrClearedCredentialsCannotRestore() {
        assertFalse(LinkedSignIn.canRestore("verified-device-token", true, false));
    }
    @Test public voidClearedDeviceTokenCannotRestore() {
        assertFalse(LinkedSignIn.canRestore("", true, true));
    }
}