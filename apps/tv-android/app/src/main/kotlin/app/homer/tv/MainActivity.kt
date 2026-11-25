package app.homer.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

// One full-screen page and nothing else: HOMER's /tv page, kept on screen. The page refreshes its own data; this app
// only keeps it loaded.
class MainActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private val tracker = LoadTracker()
    private val homerHost: String? = Uri.parse(BuildConfig.HOMER_URL).host
    private lateinit var web: WebView
    private var resumed = false

    private val load = Runnable {
        tracker.started()
        web.loadUrl(BuildConfig.HOMER_URL)
    }

    // A full reload now and then. A try that is already waiting for its turn is left to it.
    private val refresh = object : Runnable {
        override fun run() {
            if (!tracker.failed) load.run()
            handler.postDelayed(this, LoadPolicy.refreshEveryMs)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor(SURFACE))
            isFocusable = false
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.mediaPlaybackRequiresUserGesture = true
            webViewClient = Client()
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        setContentView(web)
        load.run()
    }

    override fun onResume() {
        super.onResume()
        resumed = true
        web.onResume()
        hideSystemBars()
        // Counted from now, so a page that was just loaded is not loaded again at once.
        handler.removeCallbacks(refresh)
        handler.postDelayed(refresh, LoadPolicy.refreshEveryMs)
        // A retry that was waiting when the screen paused (the HDMI input changed, the TV slept) is made now.
        if (tracker.failed) {
            handler.removeCallbacks(load)
            load.run()
        }
    }

    override fun onPause() {
        resumed = false
        handler.removeCallbacks(refresh)
        handler.removeCallbacks(load)
        web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        web.destroy()
        super.onDestroy()
    }

    @Suppress("DEPRECATION")
    private fun hideSystemBars() {
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    }

    private fun retrySoon() {
        val delay = tracker.failedLoad()
        handler.removeCallbacks(load)
        // Outside the WebView's own callback, and only while the screen is showing: onResume makes the retry otherwise.
        handler.post { web.loadDataWithBaseURL(null, waitingPage(), "text/html", "utf-8", null) }
        if (resumed) handler.postDelayed(load, delay)
    }

    private fun waitingPage(): String =
        "<body style=\"margin:0;background:$SURFACE;color:#aaa59d;font:3vw sans-serif;" +
            "display:flex;align-items:center;justify-content:center;height:100vh\">" +
            getString(R.string.cannot_reach) + "</body>"

    private inner class Client : WebViewClient() {
        // Only HOMER's own address opens in this window. The page is read-only, so a link off it is not followed.
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            request.url.host != homerHost

        override fun onPageFinished(view: WebView, url: String?) {
            // WebView can say a failed page finished before it says it failed, so the check waits for the error.
            handler.post { tracker.finished(url) }
        }

        // Only the page itself: a failed picture or script inside it is the page's business.
        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) retrySoon()
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
            if (request.isForMainFrame && response.statusCode >= 500) retrySoon()
        }
    }

    private companion object {
        const val SURFACE = "#1f1d1b"
    }
}
