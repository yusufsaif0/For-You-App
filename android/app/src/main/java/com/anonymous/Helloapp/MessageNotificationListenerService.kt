package com.anonymous.Helloapp

import android.app.Notification
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

internal data class CapturedMessage(
  val id: String,
  val packageName: String,
  val appName: String,
  val title: String,
  val message: String,
  val postedAt: Long,
)

internal object CapturedMessageStore {
  private const val STORE_FILE = "captured-notification-messages.json"
  private const val MAX_MESSAGES = 500

  val supportedApps = mapOf(
    "com.whatsapp" to "WhatsApp",
    "com.instagram.android" to "Instagram",
    "com.facebook.katana" to "Facebook",
    "com.facebook.orca" to "Messenger",
  )

  private fun store(context: android.content.Context) =
    AtomicFile(File(context.noBackupFilesDir, STORE_FILE))

  @Synchronized
  fun read(context: android.content.Context): List<CapturedMessage> {
    val file = store(context)
    if (!file.baseFile.exists()) return emptyList()
    val bytes = try {
      file.openRead().use { it.readBytes() }
    } catch (error: Exception) {
      throw IllegalStateException("Saved notification captures could not be read.", error)
    }
    val root = try {
      JSONArray(String(bytes, Charsets.UTF_8))
    } catch (error: Exception) {
      throw IllegalStateException("Saved notification captures are invalid; the data was not changed.", error)
    }
    return (0 until root.length()).map { index ->
      val item = root.getJSONObject(index)
      CapturedMessage(
        id = item.getString("id"),
        packageName = item.getString("packageName"),
        appName = item.getString("appName"),
        title = item.getString("title"),
        message = item.getString("message"),
        postedAt = item.getLong("postedAt"),
      )
    }.sortedByDescending { it.postedAt }
  }

  @Synchronized
  fun capture(context: android.content.Context, message: CapturedMessage) {
    val current = read(context).toMutableList()
    val existing = current.indexOfFirst { it.id == message.id }
    if (existing >= 0) current.removeAt(existing)
    current.add(0, message)
    write(context, current.take(MAX_MESSAGES))
  }

  @Synchronized
  fun delete(context: android.content.Context, id: String) {
    val current = read(context)
    val next = current.filterNot { it.id == id }
    if (next.size == current.size) throw NoSuchElementException("This saved notification no longer exists.")
    write(context, next)
  }

  @Synchronized
  fun clear(context: android.content.Context) {
    write(context, emptyList())
  }

  private fun write(context: android.content.Context, messages: List<CapturedMessage>) {
    val root = JSONArray()
    messages.forEach { message ->
      root.put(JSONObject().apply {
        put("id", message.id)
        put("packageName", message.packageName)
        put("appName", message.appName)
        put("title", message.title)
        put("message", message.message)
        put("postedAt", message.postedAt)
      })
    }
    val file = store(context)
    var output: java.io.FileOutputStream? = null
    try {
      output = file.startWrite()
      output.write(root.toString().toByteArray(Charsets.UTF_8))
      file.finishWrite(output)
    } catch (error: Exception) {
      if (output != null) file.failWrite(output)
      throw IllegalStateException("Notification captures could not be saved on this device.", error)
    }
  }

  fun idFor(packageName: String, notificationKey: String): String {
    val digest = MessageDigest.getInstance("SHA-256")
      .digest("$packageName\u0000$notificationKey".toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { byte -> "%02x".format(byte) }
  }
}

class MessageNotificationListenerService : NotificationListenerService() {
  override fun onNotificationPosted(statusBarNotification: StatusBarNotification) {
    val appName = CapturedMessageStore.supportedApps[statusBarNotification.packageName] ?: return
    if (statusBarNotification.packageName == packageName) return
    val notification = statusBarNotification.notification ?: return
    if (statusBarNotification.isOngoing || notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
    val extras = notification.extras ?: return
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty().ifBlank { appName }
    val messageParts = mutableListOf<String>()
    listOf(Notification.EXTRA_BIG_TEXT, Notification.EXTRA_TEXT).forEach { key ->
      extras.getCharSequence(key)?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let(messageParts::add)
    }
    extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.forEach { line ->
      line?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let(messageParts::add)
    }
    extras.getParcelableArray(Notification.EXTRA_MESSAGES)?.forEach { parcelable ->
      val messageBundle = parcelable as? Bundle ?: return@forEach
      val text = messageBundle.getCharSequence("text")?.toString()?.trim().orEmpty()
      if (text.isNotEmpty()) {
        val sender = messageBundle.getCharSequence("sender")?.toString()?.trim().orEmpty()
        messageParts.add(if (sender.isNotEmpty()) "$sender: $text" else text)
      }
    }
    val message = messageParts.distinct().joinToString("\n").take(4_000).trim()
    if (title.isBlank() || message.isBlank()) return

    try {
      CapturedMessageStore.capture(
        applicationContext,
        CapturedMessage(
          id = CapturedMessageStore.idFor(statusBarNotification.packageName, statusBarNotification.key),
          packageName = statusBarNotification.packageName,
          appName = appName,
          title = title.take(200),
          message = message,
          postedAt = statusBarNotification.postTime,
        ),
      )
    } catch (error: Exception) {
      android.util.Log.e("MessageCapture", "Could not save a notification capture.", error)
    }
  }
}
