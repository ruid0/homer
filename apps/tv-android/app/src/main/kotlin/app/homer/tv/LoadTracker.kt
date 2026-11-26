package app.homer.tv

// What the app knows about loading the page: whether this try failed, and how many failed in a row. Pure, so the rules
// can be tested without a TV.
class LoadTracker {
    var failures = 0
        private set

    // The current try failed and has not been tried again yet.
    var failed = false
        private set

    fun started() {
        failed = false
    }

    // Returns how long to wait before the next try.
    fun failedLoad(): Long {
        failed = true
        failures += 1
        return LoadPolicy.delayAfterFailureMs(failures)
    }

    // WebView also finishes a page that failed, and the waiting page we show ourselves finishes as "about:blank". Neither
    // is a success, and counting them would keep the wait at its shortest forever.
    fun finished(url: String?) {
        if (!failed && url != null && url != BLANK) failures = 0
    }

    private companion object {
        const val BLANK = "about:blank"
    }
}
