package com.momentsplanner.events

import android.graphics.Bitmap
import android.os.SystemClock
import android.view.ViewGroup
import android.webkit.WebView
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.pressBackUnconditionally
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Pruebas reales del paquete Android con todas las funciones disponibles sin cuota. */
@RunWith(AndroidJUnit4::class)
class PaywallInstrumentedTest {
    private fun evaluate(scenario: ActivityScenario<MainActivity>, script: String): String {
        val done = CountDownLatch(1)
        var result = ""
        scenario.onActivity { activity ->
            val root = activity.findViewById<ViewGroup>(android.R.id.content).getChildAt(0) as ViewGroup
            (root.getChildAt(0) as WebView).evaluateJavascript(script) { result = it; done.countDown() }
        }
        assertTrue("No responde WebView", done.await(10, TimeUnit.SECONDS))
        return result
    }
    private fun waitForLaunch(scenario: ActivityScenario<MainActivity>) {
        val deadline = SystemClock.uptimeMillis() + 30000
        var ready = false
        while (!ready && SystemClock.uptimeMillis() < deadline) {
            ready = evaluate(scenario, "document.readyState==='complete' && document.querySelector('[data-screen=home]')?.classList.contains('active')") == "true"
            if (!ready) SystemClock.sleep(200)
        }
        assertTrue("No se abrió Inicio", ready)
    }
    @Test fun opensWithoutSubscriptionOrAdditionalPurchase() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitForLaunch(scenario)
            assertEquals("false", evaluate(scenario, "!!document.querySelector('#paywall')"))
            assertEquals("false", evaluate(scenario, "!!document.querySelector('#subscribeBtn')"))
            assertEquals("true", evaluate(scenario, "!!document.querySelector('[data-new-project=wedding]')"))
            val instrumentation = InstrumentationRegistry.getInstrumentation()
            val folder = File(instrumentation.targetContext.getExternalFilesDir(null), "policy-evidence").apply { mkdirs() }
            val bitmap = instrumentation.uiAutomation.takeScreenshot()
            assertNotNull(bitmap)
            File(folder, "pago-unico-inicio.png").outputStream().use {
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
            }
            bitmap.recycle()
        }
    }
    @Test fun backExitsFromHome() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            waitForLaunch(scenario)
            pressBackUnconditionally()
            val deadline = SystemClock.uptimeMillis() + 10000
            while (scenario.state != Lifecycle.State.DESTROYED && SystemClock.uptimeMillis() < deadline)
                SystemClock.sleep(100)
            assertEquals(Lifecycle.State.DESTROYED, scenario.state)
        }
    }
}
