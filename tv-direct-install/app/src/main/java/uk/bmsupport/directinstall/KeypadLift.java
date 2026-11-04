package uk.bmsupport.directinstall;

/** Pure calculation for how far a screen lifts above the on-screen keypad (unit-testable). */
final class KeypadLift {
    private KeypadLift() {}

    static int lift(int imeBottom, int navBottom) {
        return Math.max(0, Math.max(imeBottom, navBottom));
    }
}
