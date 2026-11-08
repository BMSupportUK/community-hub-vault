package uk.bmsupport.player;

/** Synthetic/saved categories never wake country downloads. */
final class EpgCategoryDemand {
    static boolean eligible(String name) {
        return name != null && name.trim().matches("^[A-Za-z]{2,4}\\s*\\|.*");
    }
}