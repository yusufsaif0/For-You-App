package com.anonymous.Helloapp

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import androidx.core.app.NotificationCompat

class StepCounterService : Service(), SensorEventListener {
  private var sensorManager: SensorManager? = null
  private var stepSensor: Sensor? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
      checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED
    ) {
      stopTrackingState()
      stopSelf()
      return START_NOT_STICKY
    }

    startForeground(NOTIFICATION_ID, buildNotification())
    sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    stepSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    if (stepSensor == null) {
      stopTrackingState()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }

    getSharedPreferences(STEP_PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putBoolean("tracking", true)
      .apply()
    sensorManager?.unregisterListener(this)
    sensorManager?.registerListener(this, stepSensor, SensorManager.SENSOR_DELAY_NORMAL)
    return START_STICKY
  }

  override fun onSensorChanged(event: SensorEvent?) {
    val sensorCount = event?.values?.firstOrNull()?.toLong() ?: return
    val preferences = getSharedPreferences(STEP_PREFERENCES, Context.MODE_PRIVATE)
    val today = stepDate()
    val currentBoot = try {
      Settings.Global.getInt(contentResolver, Settings.Global.BOOT_COUNT, -1)
    } catch (_: Exception) {
      -1
    }
    val previousCount = preferences.getLong("last_sensor_count", -1L)
    val previousBoot = preferences.getInt("last_boot_count", currentBoot)
    val isNewBoot = currentBoot >= 0 && previousBoot >= 0 && currentBoot != previousBoot
    val increment = when {
      isNewBoot || sensorCount < previousCount -> 0L
      previousCount < 0L -> 1L
      else -> sensorCount - previousCount
    }
    val todayKey = "steps_$today"
    val currentSteps = preferences.getInt(todayKey, 0)
    preferences.edit()
      .putInt(todayKey, (currentSteps.toLong() + increment).coerceAtMost(Int.MAX_VALUE.toLong()).toInt())
      .putLong("last_sensor_count", sensorCount)
      .putInt("last_boot_count", currentBoot)
      .apply()

    val oldestDate = stepDate(HISTORY_DAYS)
    preferences.all.keys
      .filter { it.startsWith("steps_") && it.removePrefix("steps_") < oldestDate }
      .forEach { preferences.edit().remove(it).apply() }
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  override fun onDestroy() {
    sensorManager?.unregisterListener(this)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun stopTrackingState() {
    getSharedPreferences(STEP_PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putBoolean("tracking", false)
      .apply()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Daily step tracking",
        NotificationManager.IMPORTANCE_LOW
      ).apply { description = "Shown while Daily Life counts steps in the background." }
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  private fun buildNotification(): Notification =
    NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_directions)
      .setContentTitle("Step tracking is on")
      .setContentText("Daily Life is counting your steps on this device.")
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .build()

  companion object {
    private const val CHANNEL_ID = "daily-life-step-tracking"
    private const val NOTIFICATION_ID = 4102
    private const val HISTORY_DAYS = 366
  }
}
