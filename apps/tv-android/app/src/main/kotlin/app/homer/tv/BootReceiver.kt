package app.homer.tv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

// Opens the app when the TV starts. Android may refuse to start a screen from the background; if the TV does, the
// app is opened once from the home screen instead (see the README).
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Log.i(TAG, "received ${intent.action}")
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        runCatching {
            context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }.onFailure { Log.w(TAG, "could not open the app", it) }
    }

    private companion object {
        const val TAG = "HomerTvBoot"
    }
}
