package com.yzemaf.safety.safety_app

import android.app.KeyguardManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity: FlutterActivity() {
    private val CHANNEL = "com.yzemaf.safety/call_foreground"
    private val CALL_NOTIFICATION_ID = 9911
    private val CALL_CHANNEL_ID = "safety_incoming_emergency_calls"
    private var methodChannel: MethodChannel? = null
    private var pendingCallData: Map<String, Any?>? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        val channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
        methodChannel = channel
        channel.setMethodCallHandler { call, result ->
            when (call.method) {
                "bringToForeground" -> {
                    val callerName = call.argument<String>("callerName") ?: "Safety Command Dispatcher"
                    val callerRole = call.argument<String>("callerRole") ?: "Control Room Officer"
                    val channelName = call.argument<String>("channelName") ?: "safety_channel"
                    val token = call.argument<String>("token")
                    val sessionId = call.argument<String>("sessionId") ?: ""
                    val userId = call.argument<String>("userId") ?: ""

                    SafetyCallNotifier.launchIncomingCall(this, callerName, callerRole, channelName, token, sessionId, userId)
                    result.success(true)
                }
                "getPendingCallIntent" -> {
                    val data = pendingCallData
                    pendingCallData = null
                    result.success(data)
                }
                "dismissCallNotification" -> {
                    SafetyCallNotifier.dismissCallNotification(this)
                    result.success(true)
                }
                "wakeLockScreen" -> {
                    SafetyCallNotifier.wakeLock(this)
                    result.success(true)
                }
                "wakeAndForeground" -> {
                    val type = call.argument<String>("type") ?: "warning"
                    val title = call.argument<String>("title") ?: "Safety Alert"
                    val message = call.argument<String>("message") ?: "Action required"
                    SafetyCallNotifier.launchSafetyAlert(this, type, title, message)
                    wakeAndUnlock()
                    result.success(true)
                }
                "dismissSafetyAlert" -> {
                    SafetyCallNotifier.dismissSafetyAlert(this)
                    result.success(true)
                }
                else -> {
                    result.notImplemented()
                }
            }
        }

        handleIncomingIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingIntent(intent)
    }

    private fun handleIncomingIntent(intent: Intent?) {
        if (intent == null) return
        val action = intent.action
        if (action == "SAFETY_WARNING_ACTION" || action == "SAFETY_EMERGENCY_ACTION") {
            SafetyCallNotifier.dismissSafetyAlert(this)
            wakeAndUnlock()
            intent.action = null
            return
        }
        if (action == "INCOMING_CALL_ACTION" || action == "ANSWER_CALL_ACTION" || intent.hasExtra("channelName")) {
            val callerName = intent.getStringExtra("callerName") ?: "Safety Command Dispatcher"
            val callerRole = intent.getStringExtra("callerRole") ?: "Control Room Officer"
            val channelName = intent.getStringExtra("channelName") ?: "safety_channel"
            val token = intent.getStringExtra("token")
            val sessionId = intent.getStringExtra("sessionId") ?: ""
            val userId = intent.getStringExtra("userId") ?: ""
            val isAnswerAction = (action == "ANSWER_CALL_ACTION")

            SafetyCallNotifier.dismissCallNotification(this)
            wakeAndUnlock()

            intent.action = null
            intent.removeExtra("channelName")

            val callData = mapOf(
                "callerName" to callerName,
                "callerRole" to callerRole,
                "channelName" to channelName,
                "token" to token,
                "sessionId" to sessionId,
                "userId" to userId,
                "autoAnswer" to isAnswerAction
            )

            pendingCallData = callData
            methodChannel?.invokeMethod("onCallIntentReceived", callData)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        wakeAndUnlock()
    }

    private fun wakeAndUnlock() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
            keyguardManager?.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
        SafetyCallNotifier.wakeLock(this)
    }
}

