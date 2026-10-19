package com.anonymous.Helloapp

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.uimanager.ViewManager

class MessageCaptureModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName() = "MessageCapture"

  @ReactMethod
  fun isNotificationAccessEnabled(promise: Promise) {
    try {
      val enabled = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners",
      ).orEmpty()
      val component = ComponentName(context, MessageNotificationListenerService::class.java)
      promise.resolve(enabled.split(':').any { ComponentName.unflattenFromString(it) == component })
    } catch (error: Exception) {
      promise.reject("MESSAGE_ACCESS_CHECK_FAILED", "Could not check Android Notification Access.", error)
    }
  }

  @ReactMethod
  fun openNotificationAccessSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("MESSAGE_ACCESS_SETTINGS_FAILED", "Could not open Android Notification Access settings.", error)
    }
  }

  @ReactMethod
  fun getCapturedMessages(promise: Promise) {
    try {
      val result = WritableNativeArray()
      CapturedMessageStore.read(context).forEach { message ->
        result.pushMap(WritableNativeMap().apply {
          putString("id", message.id)
          putString("packageName", message.packageName)
          putString("appName", message.appName)
          putString("title", message.title)
          putString("message", message.message)
          putDouble("postedAt", message.postedAt.toDouble())
        })
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("MESSAGE_CAPTURE_READ_FAILED", "Could not load saved notification captures.", error)
    }
  }

  @ReactMethod
  fun deleteCapturedMessage(id: String, promise: Promise) {
    try {
      CapturedMessageStore.delete(context, id)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("MESSAGE_CAPTURE_DELETE_FAILED", error.message ?: "Could not delete this saved capture.", error)
    }
  }

  @ReactMethod
  fun clearCapturedMessages(promise: Promise) {
    try {
      CapturedMessageStore.clear(context)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("MESSAGE_CAPTURE_CLEAR_FAILED", "Could not delete saved notification captures.", error)
    }
  }
}

class MessageCapturePackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(MessageCaptureModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
