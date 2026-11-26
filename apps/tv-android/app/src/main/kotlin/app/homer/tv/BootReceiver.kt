package app.homer.tv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Opens the app when the TV starts. Android may refuse to start a screen from the background; if the TV does, the
// app is opened once from the home screen instead (see the README).
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
