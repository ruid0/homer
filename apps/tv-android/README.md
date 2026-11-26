# HOMER TV: the Android app for the living-room TV

A tiny app for a Google TV or Android TV that opens HOMER's `/tv` page full screen and keeps it there. It has no screens of its own: the page, `docs/design-tv.md`, does the work, and this app only loads it, reloads it when it can't be reached, and keeps the screen on. It is not part of the pnpm workspace, and nothing here reads household data.

The repo is public. The address of your HOMER goes in `local.properties`, which git ignores, and never in a commit.

## 1. What you need

- A Google TV or Android TV with the **Tailscale** app installed from its Play Store, signed in to your tailnet, with always-on turned on. The TV reaches HOMER over Tailscale, the same way your phones do.
- On the Mac that serves HOMER: `tailscale serve` already shares the web page (see the main README). The TV page is that address plus `/tv`.
- On the Mac you build on (dev time only; the downloads come from Google and Maven, not HOMER):

  ```bash
  brew install openjdk@17 gradle
  brew install --cask android-commandlinetools
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17
  export PATH="$JAVA_HOME/bin:$PATH"
  yes | sdkmanager --licenses
  sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
  ```

## 2. Build

```bash
cd apps/tv-android
cp local.properties.example local.properties
# edit local.properties: homer.url=https://<your Tailscale address>/tv, and sdk.dir if it differs
./gradlew testDebugUnitTest     # the retry rules
./gradlew assembleDebug         # app/build/outputs/apk/debug/app-debug.apk
```

The build stops with a message if `homer.url` is empty. The address must start with `https://` (the app refuses plain `http`, and `tailscale serve` gives you https). It is compiled into the app, so a new address means a new build.

## 3. Install on the TV

1. On the TV: Settings, System, About, then press OK on "Android TV OS build" (or the build number) seven times to turn on developer options.
2. Settings, System, Developer options: turn on **USB debugging** (or "Wireless debugging" or "ADB debugging" on some models) and note the TV's IP address.
3. On the Mac: `adb connect <TV-IP>:5555`, accept the prompt on the TV, then `adb install -r app/build/outputs/apk/debug/app-debug.apk`.
4. Open **HOMER** from the TV's home screen (or Apps row). It should show the page within a few seconds.

## 4. How it behaves

- **The page can't be loaded** (Tailscale is not connected yet, the Mac is asleep, the Wi-Fi dropped): it shows "Can't reach HOMER. Trying again." and tries again after 5, 10 and 20 seconds, then every 30 seconds until it works.
- **Left on for weeks:** the page is loaded again from scratch every 6 hours, so a long-running page can't pile up.
- **The page's own refresh** (every minute, and the "Can't reach HOMER. Showing the last update." line) is the page's job, not the app's.
- **After a TV restart:** the app asks Android to open it at boot. Android often refuses to open a screen from the background, so if it doesn't come up, open it once from the home screen. Turn the TV's Tailscale **always-on** setting on, or the first tries after boot will wait for it.
- **Remote control:** nothing in the page can be tapped. Back leaves the app.

## 5. Troubleshooting

| Symptom | Cause |
| --- | --- |
| The build says to set `homer.url` | `local.properties` is missing or the line is empty |
| `sdk.dir` is not set | Add `sdk.dir=/opt/homebrew/share/android-commandlinetools` to `local.properties` |
| "Can't reach HOMER" stays | Tailscale on the TV is not connected, or the address is wrong or starts with `http://`. Open the address in the TV's browser, if it has one, or check `tailscale status` on the Mac |
| A blank dark screen, no text | The WebView on the TV is old. Update "Android System WebView" in the Play Store |
| `adb connect` is refused | USB or wireless debugging is off, or the TV is on another network |
| `adb: failed to install ... INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Uninstall the old copy first: `adb uninstall app.homer.tv` |

## 6. For developers

- `MainActivity.kt`: the full-screen WebView, the keep-screen-on flag, and the retries. `LoadPolicy.kt` (the timing) and `LoadTracker.kt` (what counts as a failure or a success) are pure, with tests. `BootReceiver.kt`: the boot start. Only HOMER's own address opens in the window; a link off it is ignored.
- No AndroidX and no runtime dependencies beyond the platform; `minSdk` 24 (Android 7).
- A debug build allows Chrome's remote debugging of the page (`chrome://inspect`); a release build does not.
- Signing a release build is not set up: the debug build is what you install on your own TV.
