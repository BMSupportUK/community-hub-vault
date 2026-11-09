package uk.bmsupport.player;

/** Legacy sign-in restoration requires a live verified link and readable local credentials. */
final class LinkedSignIn {
    private LinkedSignIn() {}

    static boolean canRestore(String token, boolean linked, boolean hasLogin) {
        return token != null && !token.isEmpty() && linked && hasLogin;
    }
}