package com.momentsplanner.events

import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.os.SystemClock
import android.view.ViewGroup
import android.webkit.WebView
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.web.sugar.Web.onWebView
import androidx.test.espresso.Espresso.pressBackUnconditionally
import androidx.test.espresso.web.webdriver.DriverAtoms.findElement
import androidx.test.espresso.web.webdriver.DriverAtoms.webClick
import androidx.test.espresso.web.webdriver.Locator
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Uses the installed Android WebView and the real exitApp bridge; no Play purchase is simulated here. */
@RunWith(AndroidJUnit4::class)
class PaywallInstrumentedTest {
    private fun evaluate(scenario: ActivityScenario<MainActivity>, script: String): String {
        val done = CountDownLatch(1)
        var result = ""
        scenario.onActivity { activity ->
            val root = activity.findViewById<ViewGroup>(android.R.id.content).getChildAt(0) as ViewGroup
            (root.getChildAt(0) as WebView).evaluateJavascript(script) { result = it; done.countDown() }
        }
        assertTrue("WebView callback timed out", done.await(10, TimeUnit.SECONDS))
        return result
    }

    private fun waitUntil(message: String, condition: () -> Boolean) {
        val deadline = SystemClock.uptimeMillis() + 30000
        while (!condition() && SystemClock.uptimeMillis() < deadline) SystemClock.sleep(100)
        assertTrue(message, condition())
    }

    private fun showPaywall(scenario: ActivityScenario<MainActivity>) {
        waitUntil("Embedded application did not initialize") {
            evaluate(scenario, "document.readyState==='complete' && typeof window.onMomentsOffer==='function' && document.querySelector('#paywall').classList.contains('hidden')") == "true"
        }
        evaluate(scenario, "window.onMomentsSubscription(false,'','Suscripción necesaria');window.onMomentsOffer('US$5.49',true);true")
        assertEquals("true", evaluate(scenario, "!document.querySelector('#paywall').classList.contains('hidden') && document.querySelector('#subscriptionPrice').textContent.includes('US$5.49')"))
    }

    private fun saveScreenshot(scenario: ActivityScenario<MainActivity>, name: String) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val visualReady = CountDownLatch(1)
        scenario.onActivity { activity ->
            val root = activity.findViewById<ViewGroup>(android.R.id.content).getChildAt(0) as ViewGroup
            val webView = root.getChildAt(0) as WebView
            webView.postVisualStateCallback(SystemClock.uptimeMillis(), object : WebView.VisualStateCallback() {
                override fun onComplete(requestId: Long) {
                    webView.postOnAnimation { visualReady.countDown() }
                }
            })
        }
        assertTrue("Paywall was not ready to draw", visualReady.await(10, TimeUnit.SECONDS))
        instrumentation.waitForIdleSync()
        instrumentation.uiAutomation.waitForIdle(750, 5000)
        assertEquals("true", evaluate(scenario, "!document.querySelector('#paywall').classList.contains('hidden')"))
        val directory = File(instrumentation.targetContext.getExternalFilesDir(null), "policy-evidence").apply { mkdirs() }
        val bitmap = instrumentation.uiAutomation.takeScreenshot()
        assertNotNull(bitmap)
        File(directory, name).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }

    private fun closeAndVerify(scenario: ActivityScenario<MainActivity>, id: String) {
        onWebView().withElement(findElement(Locator.ID, id)).perform(webClick())
        waitUntil("The real Android close bridge did not finish the Activity") { scenario.state == Lifecycle.State.DESTROYED }
    }

    @Test fun visibleTopCloseFinishesTheInstalledActivity() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            showPaywall(scenario)
            assertEquals("true", evaluate(scenario, "(()=>{const r=document.querySelector('#closePaywall').getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight && r.width>=44 && r.height>=44})()"))
            saveScreenshot(scenario, "paywall-portrait.png")
            closeAndVerify(scenario, "closePaywall")
        }
    }

    @Test fun bottomExitAlsoFinishesTheInstalledActivity() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            showPaywall(scenario)
            closeAndVerify(scenario, "exitPaywall")
        }
    }

    @Test fun androidBackAlsoLeavesThePaywall() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            showPaywall(scenario)
            pressBackUnconditionally()
            waitUntil("Android Back did not leave the paywall") { scenario.state == Lifecycle.State.DESTROYED }
        }
    }

    @Test fun topCloseRemainsReachableInLandscape() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { it.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE }
            waitUntil("Android did not enter landscape") {
                evaluate(scenario, "innerWidth>innerHeight") == "true"
            }
            showPaywall(scenario)
            assertEquals("true", evaluate(scenario, "(()=>{const r=document.querySelector('#closePaywall').getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight})()"))
            saveScreenshot(scenario, "paywall-landscape.png")
            closeAndVerify(scenario, "closePaywall")
        }
    }
}
