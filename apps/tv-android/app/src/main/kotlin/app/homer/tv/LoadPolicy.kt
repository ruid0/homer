package app.homer.tv

import java.util.concurrent.TimeUnit

// When to try the page again. Pure, so it can be tested without a TV.
object LoadPolicy {
    // The TV starts the app before Tailscale is connected, so the first tries come quickly. After that it waits longer
    // and stays there.
    private val delaysSeconds = listOf(5L, 10L, 20L)
    private const val STEADY_SECONDS = 30L

    // A page that keeps working is loaded again from scratch now and then, so a TV left on for weeks does not hold on to
    // a leaking page.
    val refreshEveryMs: Long = TimeUnit.HOURS.toMillis(6)

    // How long to wait after the nth failure in a row (1 for the first).
    fun delayAfterFailureMs(failures: Int): Long {
        require(failures >= 1) { "failures starts at 1" }
        val seconds = delaysSeconds.getOrElse(failures - 1) { STEADY_SECONDS }
        return TimeUnit.SECONDS.toMillis(seconds)
    }
}
