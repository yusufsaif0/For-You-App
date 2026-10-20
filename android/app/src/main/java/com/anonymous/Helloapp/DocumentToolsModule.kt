package com.anonymous.Helloapp

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Renders locally with Android's PDF engine. No storage/network permissions required. */
class DocumentToolsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newSingleThreadExecutor()
  override fun getName() = "DocumentTools"

  private fun cacheFile(uri: String): File {
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "Only private temporary files can be processed." }
    val file = File(requireNotNull(parsed.path)).canonicalFile
    val cache = context.cacheDir.canonicalFile.path + File.separator
    require(file.path.startsWith(cache) && file.parentFile?.name?.startsWith("document-tools-") == true) {
      "Only document-tool temporary files can be processed."
    }
    return file
  }

  @ReactMethod
  fun pageCount(uri: String, promise: Promise) {
    executor.execute {
      try {
        ParcelFileDescriptor.open(cacheFile(uri), ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
          PdfRenderer(descriptor).use { renderer ->
            require(renderer.pageCount in 1..60) { "Choose a PDF with 1 to 60 pages." }
            promise.resolve(renderer.pageCount)
          }
        }
      } catch (error: Exception) {
        promise.reject("PDF_OPEN_FAILED", "Could not open this PDF. Use an unencrypted, valid PDF with up to 60 pages.", error)
      }
    }
  }

  @ReactMethod
  fun renderPage(uri: String, index: Int, edge: Int, quality: Double, outputUri: String, promise: Promise) {
    executor.execute {
      try {
        require(edge in 128..3000 && quality in 0.0..1.0) { "Invalid rendering settings." }
        val source = cacheFile(uri)
        val output = cacheFile(outputUri)
        require(source != output && source.parentFile == output.parentFile) { "Invalid output path." }
        ParcelFileDescriptor.open(source, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
          PdfRenderer(descriptor).use { renderer ->
            require(index in 0 until renderer.pageCount) { "This PDF page does not exist." }
            renderer.openPage(index).use { page ->
              val scale = min(3.0, edge.toDouble() / max(page.width, page.height))
              val bitmap = Bitmap.createBitmap(max(1, (page.width * scale).roundToInt()), max(1, (page.height * scale).roundToInt()), Bitmap.Config.ARGB_8888)
              try {
                bitmap.eraseColor(Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                output.outputStream().use { stream ->
                  check(bitmap.compress(Bitmap.CompressFormat.JPEG, (quality * 100).roundToInt(), stream)) { "Could not encode this PDF page." }
                }
                promise.resolve(Arguments.createMap().apply {
                  putInt("width", page.width)
                  putInt("height", page.height)
                })
              } finally {
                bitmap.recycle()
              }
            }
          }
        }
      } catch (error: Exception) {
        promise.reject("PDF_RENDER_FAILED", "Could not render this PDF page.", error)
      }
    }
  }

  override fun invalidate() {
    executor.shutdown()
    super.invalidate()
  }
}

class DocumentToolsPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(DocumentToolsModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
