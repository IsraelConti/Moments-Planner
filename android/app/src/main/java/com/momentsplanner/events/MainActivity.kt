package com.momentsplanner.events

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.android.billingclient.api.*
import org.json.JSONObject

class MainActivity : AppCompatActivity(), PurchasesUpdatedListener {
    companion object { private const val PRODUCT_MONTHLY = "moments_planner_premium_monthly" }
    private lateinit var webView: WebView
    private lateinit var billingClient: BillingClient
    private var monthlyProduct: ProductDetails? = null
    private var connecting = false
    private var loadingProduct = false
    private var queryingPurchases = false
    private var pendingSubscribe = false
    private var billingFlowOpen = false
    private val acknowledgementsInFlight = mutableSetOf<String>()
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingSaveBytes: ByteArray? = null
    private var pendingSaveName = ""

    private val filePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val uris = if (result.resultCode == Activity.RESULT_OK) WebChromeClient.FileChooserParams.parseResult(result.resultCode,result.data) else null
        fileCallback?.onReceiveValue(uris); fileCallback=null
    }
    private val saveFilePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val name=pendingSaveName; val bytes=pendingSaveBytes
        val success=if(result.resultCode==Activity.RESULT_OK&&result.data?.data!=null&&bytes!=null) try { contentResolver.openOutputStream(result.data!!.data!!)?.use{it.write(bytes);true}?:false } catch(_:Exception){false} else false
        pendingSaveBytes=null;pendingSaveName="";js("window.onMomentsFileSaved($success,${quote(name)})")
    }

    @SuppressLint("SetJavaScriptEnabled") override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        billingClient=BillingClient.newBuilder(this).setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection().build()
        webView=WebView(this).apply{
            settings.javaScriptEnabled=true;settings.domStorageEnabled=true;settings.allowFileAccess=true;settings.allowContentAccess=true
            webViewClient=object:WebViewClient(){
                override fun onPageFinished(view:WebView?,url:String?){
                    super.onPageFinished(view,url)
                    connectBilling()
                }
            }
            webChromeClient=object:WebChromeClient(){
                override fun onShowFileChooser(webView:WebView?,callback:ValueCallback<Array<Uri>>?,params:FileChooserParams?):Boolean{
                    fileCallback?.onReceiveValue(null);fileCallback=callback
                    val intent=params?.createIntent()?:return false
                    return try{filePicker.launch(intent);true}catch(_:Exception){fileCallback?.onReceiveValue(null);fileCallback=null;false}
                }
            }
            addJavascriptInterface(AndroidBridge(),"MomentsAndroid")
        }
        val root = FrameLayout(this)
        root.addView(webView, FrameLayout.LayoutParams(-1, -1))
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val safeTypes = WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            val safe = insets.getInsets(safeTypes)
            val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(safe.left, safe.top, safe.right, maxOf(safe.bottom, keyboard.bottom))
            // These areas are handled by the native container; don't pad the WebView twice.
            WindowInsetsCompat.Builder(insets)
                .setInsets(safeTypes or WindowInsetsCompat.Type.ime(), Insets.NONE).build()
        }
        setContentView(root)
        ViewCompat.requestApplyInsets(root)
        webView.loadUrl("file:///android_asset/index.html")
        onBackPressedDispatcher.addCallback(this,object:OnBackPressedCallback(true){
            override fun handleOnBackPressed(){
                webView.evaluateJavascript("(function(){if(window.onAndroidBack&&window.onAndroidBack()){return 'handled'}return 'exit'})()"){
                    if(it.contains("exit")){isEnabled=false;onBackPressedDispatcher.onBackPressed()}
                }
            }
        })
    }

    private fun connectBilling() {
        if (BuildConfig.DEBUG) {
            js("window.onMomentsOffer('4,99 €',true)")
            subscriptionResult(true, "", "Modo de prueba")
            return
        }
        if (billingClient.isReady) {
            if (monthlyProduct == null) loadProduct()
            querySubscription()
            return
        }
        if (connecting) return
        connecting = true
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) = runOnUiThread {
                connecting = false
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    loadProduct()
                    querySubscription()
                } else {
                    pendingSubscribe = false
                    js("window.onMomentsOfferUnavailable(${quote("No se pudo conectar con Google Play. Comprueba la conexión y pulsa Restaurar compra para reintentar.")})")
                    purchaseError("Google Play no está disponible. No se ha realizado ningún cobro.")
                }
            }
            override fun onBillingServiceDisconnected() = runOnUiThread {
                connecting = false
                monthlyProduct = null
                pendingSubscribe = false
                js("window.onMomentsOfferUnavailable(${quote("Se perdió la conexión con Google Play. Pulsa Restaurar compra para volver a conectar.")})")
            }
        })
    }

    private fun loadProduct() {
        if (loadingProduct) return
        loadingProduct = true
        val product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(PRODUCT_MONTHLY).setProductType(BillingClient.ProductType.SUBS).build()
        val params = QueryProductDetailsParams.newBuilder().setProductList(listOf(product)).build()
        billingClient.queryProductDetailsAsync(params) { result, response -> runOnUiThread {
            loadingProduct = false
            monthlyProduct = if (result.responseCode == BillingClient.BillingResponseCode.OK)
                response.productDetailsList.firstOrNull { it.productId == PRODUCT_MONTHLY } else null
            val offer = preferredMonthlyOffer(monthlyProduct)
            if (offer == null) {
                pendingSubscribe = false
                js("window.onMomentsOfferUnavailable(${quote("El plan mensual no está disponible en Google Play. Pulsa Restaurar compra para reintentar.")})")
            } else {
                val price = offer.pricingPhases.pricingPhaseList.last().formattedPrice
                js("window.onMomentsOffer(${quote(price)},${hasThreeDayTrial(offer)})")
                // Continue the original tap after the asynchronous connection/product lookup.
                if (pendingSubscribe) {
                    pendingSubscribe = false
                    launchSubscription()
                }
            }
        }}
    }

    private fun querySubscription() {
        if (BuildConfig.DEBUG) return
        if (queryingPurchases) return
        queryingPurchases = true
        billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()
        ) { result, purchases -> runOnUiThread {
            queryingPurchases = false
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                // A transport error is not evidence that a previously verified purchase expired.
                purchaseError("No se pudo comprobar la compra. Comprueba la conexión y pulsa Restaurar compra.")
                return@runOnUiThread
            }
            val relevant = purchases.filter { it.products.contains(PRODUCT_MONTHLY) }
            val active = relevant.any { it.purchaseState == Purchase.PurchaseState.PURCHASED }
            val pending = relevant.any { it.purchaseState == Purchase.PurchaseState.PENDING }
            subscriptionResult(active, "", when {
                active -> "Suscripción activa"
                pending -> "Pago pendiente de confirmación en Google Play. El acceso se activará cuando se complete."
                else -> "No se ha encontrado una suscripción activa en esta cuenta de Google Play."
            })
            relevant.forEach(::acknowledge)
        }}
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>?) = runOnUiThread {
        billingFlowOpen = false
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                val completed = purchases.orEmpty().filter {
                    it.products.contains(PRODUCT_MONTHLY) && it.purchaseState == Purchase.PurchaseState.PURCHASED
                }
                if (completed.isNotEmpty()) {
                    subscriptionResult(true, "", "Suscripción activa")
                    completed.forEach(::acknowledge)
                } else querySubscription()
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> purchaseError("Compra cancelada. No se ha realizado ningún cobro.")
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> querySubscription()
            else -> purchaseError("No se pudo completar la operación con Google Play. Inténtalo de nuevo.")
        }
    }

    private fun acknowledge(purchase: Purchase) {
        if (!purchase.products.contains(PRODUCT_MONTHLY) ||
            purchase.purchaseState != Purchase.PurchaseState.PURCHASED ||
            purchase.isAcknowledged || !acknowledgementsInFlight.add(purchase.purchaseToken)) return
        billingClient.acknowledgePurchase(
            AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchase.purchaseToken).build()
        ) { result -> runOnUiThread {
            acknowledgementsInFlight.remove(purchase.purchaseToken)
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                // Retry on the next resume/restore, rather than an unbounded query/acknowledge loop.
                purchaseError("La compra está activa, pero falta confirmarla con Google Play. Pulsa Restaurar compra con conexión.")
            }
        }}
    }

    private fun beginSubscription() {
        if (BuildConfig.DEBUG) {
            purchaseError("Las compras reales solo están disponibles en la versión de Google Play.")
            return
        }
        if (pendingSubscribe || billingFlowOpen) return
        pendingSubscribe = true
        js("window.onMomentsPurchaseProgress(${quote("Conectando con el pago seguro de Google Play…")})")
        if (!billingClient.isReady) connectBilling()
        else if (monthlyProduct == null) loadProduct()
        else {
            pendingSubscribe = false
            launchSubscription()
        }
    }

    private fun launchSubscription() {
        val product = monthlyProduct
        val offer = preferredMonthlyOffer(product)
        if (product == null || offer == null) {
            purchaseError("No se ha encontrado una oferta mensual válida. Pulsa Restaurar compra para reintentar.")
            return
        }
        val details = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(product).setOfferToken(offer.offerToken).build()
        js("window.onMomentsPurchaseProgress(${quote("Abriendo el pago seguro de Google Play…")})")
        billingFlowOpen = true
        val result = billingClient.launchBillingFlow(this,
            BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(details)).build())
        if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            billingFlowOpen = false
            if (result.responseCode == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) querySubscription()
            else purchaseError("No se pudo abrir el pago de Google Play. Inténtalo de nuevo.")
        }
    }

    private fun phases(offer: ProductDetails.SubscriptionOfferDetails) =
        offer.pricingPhases.pricingPhaseList.map {
            MonthlyOfferPolicy.Phase(it.priceAmountMicros, it.formattedPrice, it.billingPeriod, it.recurrenceMode, it.billingCycleCount)
        }
    private fun preferredMonthlyOffer(product: ProductDetails?) =
        product?.subscriptionOfferDetails.orEmpty()
            .filter { MonthlyOfferPolicy.supported(phases(it)) }
            .let { offers -> offers.firstOrNull(::hasThreeDayTrial) ?: offers.firstOrNull() }
    private fun hasThreeDayTrial(offer: ProductDetails.SubscriptionOfferDetails) =
        MonthlyOfferPolicy.hasTrial(phases(offer))
    private fun subscriptionResult(active:Boolean,price:String,message:String)=js("window.onMomentsSubscription($active,${quote(price)},${quote(message)})")
    private fun purchaseError(message: String) = js("window.onMomentsPurchaseError(${quote(message)})")
    private fun js(code:String)=runOnUiThread{if(::webView.isInitialized && !isDestroyed && !isFinishing)webView.evaluateJavascript(code,null)}
    private fun quote(value: String): String = JSONObject.quote(value)

    inner class AndroidBridge{
        @JavascriptInterface fun appVersion()=BuildConfig.VERSION_NAME
        @JavascriptInterface fun checkSubscription()=runOnUiThread{connectBilling()}
        @JavascriptInterface fun subscribeMonthly()=runOnUiThread{beginSubscription()}
        @JavascriptInterface fun restorePurchases()=runOnUiThread{
            js("window.onMomentsPurchaseProgress(${quote("Comprobando las compras de esta cuenta en Google Play…")})")
            monthlyProduct=null
            connectBilling()
        }
        @JavascriptInterface fun manageSubscription()=runOnUiThread{
            try{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://play.google.com/store/account/subscriptions?sku=$PRODUCT_MONTHLY&package=$packageName")))}
            catch(_:Exception){purchaseError("No se pudo abrir Google Play para gestionar la suscripción.")}
        }
        @JavascriptInterface fun exitApp()=runOnUiThread{finish()}
        @JavascriptInterface fun saveBase64File(fileName:String,mimeType:String,base64:String){val bytes=try{Base64.decode(base64,Base64.DEFAULT)}catch(_:Exception){js("window.onMomentsFileSaved(false,${quote(fileName)})");return};runOnUiThread{if(pendingSaveBytes!=null){purchaseError("Termina de guardar el archivo anterior.");return@runOnUiThread};pendingSaveBytes=bytes;pendingSaveName=fileName;val safe=fileName.take(120).replace(Regex("[\\\\/:*?\"<>|]"),"_");val intent=Intent(Intent.ACTION_CREATE_DOCUMENT).apply{addCategory(Intent.CATEGORY_OPENABLE);type=mimeType.ifBlank{"application/octet-stream"};putExtra(Intent.EXTRA_TITLE,safe)};try{saveFilePicker.launch(intent)}catch(_:Exception){pendingSaveBytes=null;pendingSaveName="";js("window.onMomentsFileSaved(false,${quote(fileName)})")}}}
    }
    override fun onResume(){super.onResume();if(::billingClient.isInitialized&&!BuildConfig.DEBUG)connectBilling()}
    override fun onDestroy(){if(::billingClient.isInitialized)billingClient.endConnection();super.onDestroy()}
}

