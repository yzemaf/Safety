package com.yzemaf.safety.safety_app

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class SafetyFirebaseMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d("SafetyFCM", "onMessageReceived payload data: ${remoteMessage.data}")

        val data = remoteMessage.data
        val type = data["type"]

        if (type == "incoming_call") {
            val callerName = data["callerName"] ?: "Safety Command Dispatcher"
            val callerRole = data["callerRole"] ?: "Control Room Officer"
            val channelName = data["channelName"] ?: "safety_channel"
            val token = data["token"]
            val sessionId = data["sessionId"] ?: ""
            val userId = data["userId"] ?: ""

            SafetyCallNotifier.launchIncomingCall(
                context = applicationContext,
                callerName = callerName,
                callerRole = callerRole,
                channelName = channelName,
                token = token,
                sessionId = sessionId,
                userId = userId
            )
        }
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d("SafetyFCM", "FCM onNewToken: $token")
    }
}
