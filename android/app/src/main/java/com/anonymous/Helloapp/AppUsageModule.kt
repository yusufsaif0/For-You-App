package com.anonymous.Helloapp

import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Intent
import android.os.Process
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

class AppUsageModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName() = "AppUsage"

  @ReactMethod
  fun hasUsageAccess(promise: Promise) {
    try {
      val appOps = context.getSystemService(AppOpsManager::class.java)
      val mode = appOps.checkOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        Process.myUid(),
        context.packageName
      )
      promise.resolve(mode == AppOpsManager.MODE_ALLOWED)
    } catch (error: Exception) {
      promise.reject("USAGE_ACCESS_CHECK_FAILED", "Could not check Usage Access permission.", error)
    }
  }

  @ReactMethod
  fun openUsageAccessSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("USAGE_SETTINGS_UNAVAILABLE", "Could not open Android Usage Access settings.", error)
    }
  }

  @ReactMethod
  fun queryUsageStats(startTime: Double, endTime: Double, promise: Promise) {
    try {
      if (startTime >= endTime) {
        promise.reject("INVALID_TIME_RANGE", "The requested usage time range is invalid.")
        return
      }
      val manager = context.getSystemService(UsageStatsManager::class.java)
      val stats = manager.queryUsageStats(
        UsageStatsManager.INTERVAL_DAILY,
        startTime.toLong(),
        endTime.toLong()
      )
      val totals = mutableMapOf<String, Long>()
      stats.orEmpty().forEach { stat ->
        totals[stat.packageName] = (totals[stat.packageName] ?: 0L) + stat.totalTimeInForeground
      }
      val packageManager = context.packageManager
      val result = WritableNativeArray()
      totals.filterValues { it > 0L }.forEach { (packageName, foregroundTime) ->
        val label = try {
          packageManager.getApplicationLabel(packageManager.getApplicationInfo(packageName, 0)).toString()
        } catch (_: Exception) {
          packageName
        }
        result.pushMap(WritableNativeMap().apply {
          putString("packageName", packageName)
          putString("appName", label)
          putDouble("foregroundTimeMs", foregroundTime.toDouble())
        })
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("USAGE_STATS_QUERY_FAILED", "Could not read app usage for this period.", error)
    }
  }
}

class AppUsagePackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(AppUsageModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
