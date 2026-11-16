package uk.bmsupport.player;

import android.content.SharedPreferences;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class)
public class SecureLoginFieldTest {
    private SharedPreferences prefs() {
        SharedPreferences p = org.robolectric.RuntimeEnvironment.getApplication().getSharedPreferences("secure-field-test", 0);
        p.edit().clear().commit();
        return p;
    }
    @Test public void savedServerAddressReadsBack() {
        SharedPreferences p = prefs();
        SecureLogin.put(p, p.edit(), "dns", "https://line.example:443").commit();
        assertEquals("https://line.example:443", SecureLogin.field(p, "dns"));
    }
    @Test public void olderPlainUsernameStillReads() {
        SharedPreferences p = prefs();
        p.edit().putString("user", "gj123").commit();
        assertEquals("gj123", SecureLogin.field(p, "user"));
    }
    @Test public void addressCopiedFromAnotherBoxCannotBeRead() {
        SharedPreferences p = prefs();
        p.edit().putString("dns", "enc1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAA").commit();
        assertEquals("", SecureLogin.field(p, "dns"));
    }
}
