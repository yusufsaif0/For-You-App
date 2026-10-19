package com.anonymous.Helloapp

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.Build
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
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

internal const val STEP_PREFERENCES = "daily_life_steps"

internal fun stepDate(daysAgo: Int = 0): String {
  val calendar = Calendar.getInstance()
  calendar.add(Calendar.DAY_OF_YEAR, -daysAgo)
  return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(calendar.timeInMillis))
}

class StepCounterModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName() = "StepCounter"

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
      val hasSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null
      val preferences = context.getSharedPreferences(STEP_PREFERENCES, Context.MODE_PRIVATE)
      val today = stepDate()
      val days = WritableNativeArray()
      for (offset in 6 downTo 0) {
        val date = stepDate(offset)
        days.pushMap(WritableNativeMap().apply {
          putString("date", date)
          putInt("steps", preferences.getInt("steps_$date", 0))
        })
      }
      promise.resolve(WritableNativeMap().apply {
        putBoolean("available", hasSensor)
        putBoolean("tracking", preferences.getBoolean("tracking", false))
        putInt("todaySteps", preferences.getInt("steps_$today", 0))
        putArray("lastSevenDays", days)
      })
    } catch (error: Exception) {
      promise.reject("STEP_STATUS_FAILED", "Could not read step-tracking status.", error)
    }
  }

  @ReactMethod
  fun startTracking(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
        context.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED
      ) {
        promise.reject("ACTIVITY_RECOGNITION_REQUIRED", "Allow Activity Recognition before starting step tracking.")
        return
      }
      val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
      if (sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) == null) {
        promise.reject("STEP_SENSOR_UNAVAILABLE", "This device does not have a step-counter sensor.")
        return
      }
      val preferences = context.getSharedPreferences(STEP_PREFERENCES, Context.MODE_PRIVATE)
      if (!preferences.getBoolean("tracking", false)) {
        preferences.edit()
          .remove("last_sensor_count")
          .remove("last_boot_count")
          .apply()
      }
      val intent = Intent(context, StepCounterService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
      else context.startService(intent)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("STEP_TRACKING_START_FAILED", "Could not start background step tracking.", error)
    }
  }

  @ReactMethod
  fun stopTracking(promise: Promise) {
    try {
      context.getSharedPreferences(STEP_PREFERENCES, Context.MODE_PRIVATE)
        .edit()
        .putBoolean("tracking", false)
        .remove("last_sensor_count")
        .remove("last_boot_count")
        .apply()
      context.stopService(Intent(context, StepCounterService::class.java))
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("STEP_TRACKING_STOP_FAILED", "Could not stop background step tracking.", error)
    }
  }
}

class StepCounterPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(StepCounterModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
