package uk.bmsupport.player;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public final class InactivityWatchdogTest {
    public static void main(String[] args) throws Exception {
        InactivityWatchdog watchdog = new InactivityWatchdog();
        CountDownLatch requested = new CountDownLatch(1), forced = new CountDownLatch(1);
        // The normal shutdown only queues UI work; simulate that UI never doing it.
        watchdog.arm(0, requested::countDown, forced::countDown);
        if (!requested.await(1, TimeUnit.SECONDS)) throw new AssertionError("Exit must be requested at the deadline");
        if (!forced.await(3, TimeUnit.SECONDS)) throw new AssertionError("Blocked screen must not prevent process shutdown");
        watchdog.cancel();

        CountDownLatch cancelled = new CountDownLatch(1);
        watchdog.arm(100, cancelled::countDown, cancelled::countDown);
        watchdog.cancel();
        if (cancelled.await(1800, TimeUnit.MILLISECONDS)) throw new AssertionError("Continue viewing must cancel both shutdowns");

        CountDownLatch original = new CountDownLatch(1);
        watchdog.arm(100, original::countDown, () -> {});
        watchdog.arm(60_000, () -> {}, () -> {});
        if (!original.await(1, TimeUnit.SECONDS)) throw new AssertionError("Recreating a warning must not extend its deadline");
        watchdog.cancel();
        System.out.println("4 inactivity watchdog checks passed");
    }
}