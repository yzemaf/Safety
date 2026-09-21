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
import android.os.PowerManager
import androidx.core.app.NotificationCompat

object SafetyCallNotifier {
    const val CALL_NOTIFICATION_ID = 9911
    const val CALL_CHANNEL_ID = "safety_incoming_emergency_calls"

    private var lastCallChannel: String? = null
    private var lastCallTime: Long = 0L

    fun wakeLock(context: Context) {
        try {
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            @Suppress("DEPRECATION")
            val wakeLock = powerManager?.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
                "Safety:IncomingCallWakeLock"
            )
            wakeLock?.acquire(15000) // 15 seconds wake lock
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun launchIncomingCall(
        context: Context,
        callerName: String,
        callerRole: String,
        channelName: String,
        token: String?,
        sessionId: String,
        userId: String
    ) {
        val now = System.currentTimeMillis()
        if (channelName == lastCallChannel && (now - lastCallTime) < 4000) {
            return // Guard against duplicate calls within 4s
        }
        lastCallChannel = channelName
        lastCallTime = now

        wakeLock(context)

        // 1. Create High Priority Notification Channel with Ringtone
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CALL_CHANNEL_ID,
                "Safety Incoming Emergency Calls",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Incoming voice calls from Safety Control Room"
                enableLights(true)
                enableVibration(true)
                setBypassDnd(true)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                val audioAttributes = AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .build()
                val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                setSound(soundUri, audioAttributes)
            }
            notificationManager.createNotificationChannel(channel)
        }

        // Full-screen Activity Intent to bring app immediately to foreground
        val fullScreenIntent = Intent(context, MainActivity::class.java).apply {
            action = "INCOMING_CALL_ACTION"
            addCategory(Intent.CATEGORY_LAUNCHER)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("callerName", callerName)
            putExtra("callerRole", callerRole)
            putExtra("channelName", channelName)
            putExtra("token", token)
            putExtra("sessionId", sessionId)
            putExtra("userId", userId)
        }

        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)

        val fullScreenPendingIntent = PendingIntent.getActivity(
            context,
            CALL_NOTIFICATION_ID,
            fullScreenIntent,
            pendingFlags
        )

        // Answer Action Intent
        val answerIntent = Intent(context, MainActivity::class.java).apply {
            action = "ANSWER_CALL_ACTION"
            setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra("callerName", callerName)
            putExtra("callerRole", callerRole)
            putExtra("channelName", channelName)
            putExtra("token", token)
            putExtra("sessionId", sessionId)
            putExtra("userId", userId)
        }

        val answerPendingIntent = PendingIntent.getActivity(
            context,
            CALL_NOTIFICATION_ID + 1,
            answerIntent,
            pendingFlags
        )

        // Decline Action Broadcast Intent
        val declineIntent = Intent(context, CallActionReceiver::class.java).apply {
            action = "DECLINE_CALL_ACTION"
            putExtra("sessionId", sessionId)
            putExtra("userId", userId)
        }

        val declinePendingIntent = PendingIntent.getBroadcast(
            context,
            CALL_NOTIFICATION_ID + 2,
            declineIntent,
            pendingFlags
        )

        // Build Notification with Heads-Up Answer and Decline Actions
        val notification = NotificationCompat.Builder(context, CALL_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("📞 Incoming Call: $callerName")
            .setContentText("$callerRole is calling • Tap to answer")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setColor(0xFF10B981.toInt())
            .setAutoCancel(true)
            .setOngoing(true)
            .setTimeoutAfter(35000)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setContentIntent(fullScreenPendingIntent)
            .addAction(android.R.drawable.ic_menu_call, "ANSWER", answerPendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "DECLINE", declinePendingIntent)
            .build()

        notificationManager.notify(CALL_NOTIFICATION_ID, notification)

        // Try direct launch into foreground
        try {
            context.startActivity(fullScreenIntent)
        } catch (e: Exception) {
            try {
                fullScreenPendingIntent.send()
            } catch (e2: Exception) {
                e2.printStackTrace()
            }
        }
    }

    fun dismissCallNotification(context: Context) {
        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.cancel(CALL_NOTIFICATION_ID)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    const val WARNING_NOTIFICATION_ID = 9912
    const val EMERGENCY_NOTIFICATION_ID = 9913
    const val WARNING_CHANNEL_ID = "safety_warning_alerts"
    const val EMERGENCY_CHANNEL_ID = "safety_emergency_mode_alerts"

    fun launchSafetyAlert(
        context: Context,
        type: String, // "warning" or "emergency"
        title: String,
        message: String
    ) {
        wakeLock(context)

        val isEmergency = (type == "emergency")
        val notificationId = if (isEmergency) EMERGENCY_NOTIFICATION_ID else WARNING_NOTIFICATION_ID
        val channelId = if (isEmergency) EMERGENCY_CHANNEL_ID else WARNING_CHANNEL_ID
        val channelName = if (isEmergency) "Safety Emergency Mode Alerts" else "Safety Check-in Warnings"

        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                channelName,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Urgent alerts when Safety Mode reaches warning or emergency state"
                enableLights(true)
                enableVibration(true)
                setBypassDnd(true)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            }
            notificationManager.createNotificationChannel(channel)
        }

        val fullScreenIntent = Intent(context, MainActivity::class.java).apply {
            action = if (isEmergency) "SAFETY_EMERGENCY_ACTION" else "SAFETY_WARNING_ACTION"
            addCategory(Intent.CATEGORY_LAUNCHER)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("alertType", type)
        }

        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)

        val fullScreenPendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            fullScreenIntent,
            pendingFlags
        )

        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setColor(if (isEmergency) 0xFFDC2626.toInt() else 0xFFC2410C.toInt())
            .setAutoCancel(true)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setContentIntent(fullScreenPendingIntent)
            .build()

        notificationManager.notify(notificationId, notification)

        try {
            context.startActivity(fullScreenIntent)
        } catch (e: Exception) {
            try {
                fullScreenPendingIntent.send()
            } catch (e2: Exception) {
                e2.printStackTrace()
            }
        }
    }

    fun dismissSafetyAlert(context: Context) {
        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.cancel(WARNING_NOTIFICATION_ID)
            notificationManager.cancel(EMERGENCY_NOTIFICATION_ID)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}

