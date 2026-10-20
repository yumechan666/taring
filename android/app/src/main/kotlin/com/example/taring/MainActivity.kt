package com.example.taring

import android.content.Intent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var pendingGame: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "taring/game")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "openGame" -> {
                        if (pendingGame != null) {
                            result.error("busy", "Game sudah terbuka", null)
                        } else {
                            pendingGame = result
                            try {
                                startActivityForResult(Intent(this, GameActivity::class.java).apply {
                                    putExtra("skin", call.argument<Int>("skin") ?: 1)
                                    putExtra("area", call.argument<Int>("area") ?: 0)
                                    putExtra("muted", call.argument<Boolean>("muted") ?: false)
                                }, 101)
                            } catch (error: Exception) {
                                pendingGame = null
                                result.error("launch", error.message, null)
                            }
                        }
                    }
                    "resetGameProgress" -> {
                        getSharedPreferences("taring_game", MODE_PRIVATE).edit().clear().apply()
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    @Deprecated("Activity result bridge for the Flutter host")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 101) {
            pendingGame?.success(data?.getStringExtra("result"))
            pendingGame = null
        }
    }
}
