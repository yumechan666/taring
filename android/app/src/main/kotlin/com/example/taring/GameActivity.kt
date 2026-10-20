package com.example.taring

import android.app.Activity
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.net.Uri
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream

/** Runs the original game modules from the APK, with no CDN or Playabl host. */
class GameActivity : Activity() {
    private lateinit var webView: WebView
    private val origin = "appassets.androidplatform.net"

    /** Hide the status and navigation bars; a swipe from the edge shows them briefly. */
    private fun enterImmersive() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                )
        }
    }

    // Bars come back after a dialog, a notification shade or an app switch.
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersive()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Draw under the camera cutout in landscape, and keep the screen awake while playing.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/game/", WebViewAssetLoader.PathHandler { path ->
                localAsset("game js/$path")
            })
            .addPathHandler("/assets/audio/", WebViewAssetLoader.PathHandler { path ->
                localAsset("assets/audio/$path")
            })
            .addPathHandler("/generated-assets/", WebViewAssetLoader.PathHandler { path ->
                localAsset(if (path.endsWith(".json")) "assets/json/$path" else "assets/images/$path")
            }).build()
        WebView.setWebContentsDebuggingEnabled(
            applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        )
        webView = WebView(this).apply {
            setBackgroundColor(Color.rgb(7, 9, 18))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mediaPlaybackRequiresUserGesture = true
            addJavascriptInterface(GameBridge(), "TaringNative")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                    if (request.url.scheme == "https" && request.url.host == origin) {
                        loader.shouldInterceptRequest(request.url)?.let { return it }
                    }
                    return missing()
                }
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) =
                    request.url.scheme != "https" || request.url.host != origin
            }
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                    Log.d("TaringGame", "${message.message()} (${message.sourceId()}:${message.lineNumber()})")
                    return true
                }
            }
        }
        setContentView(webView)
        // After setContentView: the window's insets controller needs the decor view to exist.
        enterImmersive()
        val skin = intent.getIntExtra("skin", 1).coerceIn(1, 10)
        val area = intent.getIntExtra("area", 0).coerceIn(0, 10)
        val muted = intent.getBooleanExtra("muted", false)
        webView.loadUrl("https://$origin/game/index.html?skin=$skin&area=$area&muted=$muted")
    }

    private fun localAsset(path: String): WebResourceResponse {
        if (path.split('/').any { it == ".." }) return missing()
        val mime = when (path.substringAfterLast('.')) {
            "html" -> "text/html"
            "js" -> "text/javascript"
            "css" -> "text/css"
            "json" -> "application/json"
            "webp" -> "image/webp"
            "png" -> "image/png"
            "mp3" -> "audio/mpeg"
            else -> "application/octet-stream"
        }
        return try {
            // Flutter URI-encodes asset keys, including spaces in "game js".
            val assetKey = "flutter_assets/${Uri.encode(path, "/")}"
            WebResourceResponse(mime, "UTF-8", assets.open(assetKey))
        } catch (error: java.io.IOException) {
            Log.e("TaringGame", "Missing bundled asset: $path", error)
            missing()
        }
    }

    private fun missing() = WebResourceResponse(
        "text/plain", "UTF-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(byteArrayOf())
    )

    inner class GameBridge {
        @JavascriptInterface fun loadState(): String =
            getSharedPreferences("taring_game", MODE_PRIVATE).getString("save", "null") ?: "null"

        @JavascriptInterface fun saveState(json: String) {
            getSharedPreferences("taring_game", MODE_PRIVATE).edit().putString("save", json).apply()
        }

        @JavascriptInterface fun close(json: String) {
            runOnUiThread {
                setResult(RESULT_OK, Intent().putExtra("result", json))
                finish()
            }
        }
    }

    @Deprecated("Back is handled by the game's pause menu")
    override fun onBackPressed() {
        webView.evaluateJavascript("window.taringBack ? (window.taringBack(), true) : false") { value ->
            if (value != "true") finish()
        }
    }

    override fun onPause() {
        webView.evaluateJavascript("window.taringSuspend?.()", null)
        webView.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) webView.onResume()
    }

    override fun onDestroy() {
        webView.removeJavascriptInterface("TaringNative")
        webView.destroy()
        super.onDestroy()
    }
}
