package uk.bmsupport.directinstall;

/** Developer activation is a fallback, never a repeated requirement. */
final class DeveloperSetup {
    static boolean needsActivation(boolean developerEnabled, boolean installAllowed) {
        return !developerEnabled && !installAllowed;
    }
}