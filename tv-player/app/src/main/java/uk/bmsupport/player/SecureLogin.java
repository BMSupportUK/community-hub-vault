package uk.bmsupport.player;

import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Keeps the app login password scrambled with a key held in the Android Keystore,
 * so a copy of the app's data is useless on any other box. Plain values saved by
 * older versions are moved across the first time they are read.
 */
final class SecureLogin {
    private static final String ALIAS = "bm_player_login";
    private static final String PREFIX = "enc1:";
    private SecureLogin() {}

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build());
        return g.generateKey();
    }

    static String seal(String plain) {
        if (plain == null || plain.isEmpty()) return "";
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = c.getIV(), body = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return PREFIX + Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(body, Base64.NO_WRAP);
        } catch (Exception e) {
            return plain; // Keystore unavailable on this box: keep working as before.
        }
    }

    static String open(String stored) {
        if (stored == null || !stored.startsWith(PREFIX)) return stored == null ? "" : stored;
        try {
            String[] parts = stored.substring(PREFIX.length()).split(":", 2);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            return new String(c.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return ""; // Copied from another box: the key isn't here, so the login can't be read.
        }
    }

    /** Saved password, moving an older plain value into the Keystore on first read. */
    static String password(SharedPreferences prefs) {
        String raw = prefs.getString("pass", "");
        if (raw != null && !raw.isEmpty() && !raw.startsWith(PREFIX)) {
            String sealed = seal(raw);
            if (sealed.startsWith(PREFIX)) prefs.edit().putString("pass", sealed).apply();
            return raw;
        }
        return open(raw);
    }
}
