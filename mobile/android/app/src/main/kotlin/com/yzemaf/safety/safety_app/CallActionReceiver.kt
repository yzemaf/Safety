package com.yzemaf.safety.safety_app

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class CallActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        val userId = intent.getStringExtra("userId") ?: ""
        val sessionId = intent.getStringExtra("sessionId") ?: ""

        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(9911)

        if (action == "DECLINE_CALL_ACTION" && sessionId.isNotEmpty()) {
            thread {
                val candidateHosts = listOf("127.0.0.1:5000", "10.0.2.2:5000", "localhost:5000")
                for (host in candidateHosts) {
                    try {
                        val url = URL("http://$host/api/sessions/$sessionId/call-response")
                        val conn = url.openConnection() as HttpURLConnection
                        conn.requestMethod = "POST"
                        conn.connectTimeout = 3000
                        conn.readTimeout = 3000
                        conn.doOutput = true
                        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")

                        val jsonBody = JSONObject().apply {
                            put("status", "declined")
                            put("userId", userId)
                        }

                        OutputStreamWriter(conn.outputStream).use { writer ->
                            writer.write(jsonBody.toString())
                            writer.flush()
                        }

                        val responseCode = conn.responseCode
                        conn.disconnect()
                        if (responseCode in 200..299) {
                            break
                        }
                    } catch (_: Exception) {}
                }
            }
        }
    }
}

