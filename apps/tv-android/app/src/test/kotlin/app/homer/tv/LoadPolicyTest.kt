package app.homer.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LoadPolicyTest {
    @Test
    fun triesQuicklyAtFirstThenSettles() {
        assertEquals(listOf(5_000L, 10_000L, 20_000L, 30_000L), (1..4).map { LoadPolicy.delayAfterFailureMs(it) })
    }

    @Test
    fun neverWaitsLongerThanThirtySeconds() {
        assertTrue((1..1_000).all { LoadPolicy.delayAfterFailureMs(it) <= 30_000L })
    }

    @Test
    fun neverWaitsLessThanItDidBefore() {
        val delays = (1..50).map { LoadPolicy.delayAfterFailureMs(it) }
        assertEquals(delays.sorted(), delays)
    }

    @Test(expected = IllegalArgumentException::class)
    fun countsFailuresFromOne() {
        LoadPolicy.delayAfterFailureMs(0)
    }

    @Test
    fun refreshesTheWholePageEverySixHours() {
        assertEquals(6 * 60 * 60 * 1000L, LoadPolicy.refreshEveryMs)
    }
}
