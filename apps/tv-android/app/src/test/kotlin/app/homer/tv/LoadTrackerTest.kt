package app.homer.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LoadTrackerTest {
    private val page = "https://homer.example.invalid/tv"

    @Test
    fun waitsLongerAfterEachFailureInARow() {
        val tracker = LoadTracker()
        val waits = (1..4).map {
            tracker.started()
            tracker.failedLoad().also { tracker.finished(page) }
        }
        assertEquals(listOf(5_000L, 10_000L, 20_000L, 30_000L), waits)
    }

    @Test
    fun aFailedPageThatStillFinishesIsNotASuccess() {
        val tracker = LoadTracker()
        tracker.started()
        tracker.failedLoad()
        tracker.finished(page)
        assertEquals(1, tracker.failures)
        assertTrue(tracker.failed)
    }

    @Test
    fun theWaitingPageIsNotASuccessEither() {
        val tracker = LoadTracker()
        tracker.started()
        tracker.failedLoad()
        tracker.started()
        tracker.finished("about:blank")
        assertEquals(1, tracker.failures)
    }

    @Test
    fun aPageThatLoadsStartsTheCountOver() {
        val tracker = LoadTracker()
        repeat(3) {
            tracker.started()
            tracker.failedLoad()
        }
        tracker.started()
        tracker.finished(page)
        assertEquals(0, tracker.failures)
        assertFalse(tracker.failed)
        tracker.started()
        assertEquals(5_000L, tracker.failedLoad())
    }

    @Test
    fun startingATryClearsTheFailedFlag() {
        val tracker = LoadTracker()
        tracker.failedLoad()
        tracker.started()
        assertFalse(tracker.failed)
    }
}
