package com.momentsplanner.events

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.util.Base64
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.android.billingclient.api.*

class MainActivity : AppCompatActivity(), PurchasesUpdatedListener {
    companion object { private const val PRODUCT_MONTHLY = "moments_planner_premium_monthly" }
    private lateinit var webView: WebView
    private lateinit var billingClient: BillingClient
    private var monthlyProduct: ProductDetails? = null
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
        webView=WebView(this).apply{
            settings.javaScriptEnabled=true;settings.domStorageEnabled=true;settings.allowFileAccess=true;settings.allowContentAccess=true
            webViewClient=object:WebViewClient(){override fun onPageFinished(view:WebView?,url:String?){super.onPageFinished(view,url);if(BuildConfig.DEBUG){js("window.onMomentsOffer('4,99 €',true)");subscriptionResult(true,"4,99 €","Modo de prueba")}else connectBilling()}}
            webChromeClient=object:WebChromeClient(){override fun onShowFileChooser(webView:WebView?,callback:ValueCallback<Array<Uri>>?,params:FileChooserParams?):Boolean{fileCallback?.onReceiveValue(null);fileCallback=callback;val intent=params?.createIntent()?:return false;return try{filePicker.launch(intent);true}catch(_:Exception){fileCallback=null;false}}}
            addJavascriptInterface(AndroidBridge(),"MomentsAndroid");loadUrl("file:///android_asset/index.html")
        };setContentView(webView)
        billingClient=BillingClient.newBuilder(this).setListener(this).enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()).enableAutoServiceReconnection().build()
        onBackPressedDispatcher.addCallback(this,object:OnBackPressedCallback(true){override fun handleOnBackPressed(){webView.evaluateJavascript("(function(){if(window.onAndroidBack&&window.onAndroidBack()){return 'handled'}return 'exit'})()"){if(it.contains("exit")){isEnabled=false;onBackPressedDispatcher.onBackPressed()}}}})
    }
    private fun connectBilling(){if(BuildConfig.DEBUG)return subscriptionResult(true,"4,99 €","Modo de prueba");if(billingClient.isReady){if(monthlyProduct==null)loadProduct();querySubscription();return};billingClient.startConnection(object:BillingClientStateListener{override fun onBillingSetupFinished(r:BillingResult){if(r.responseCode==BillingClient.BillingResponseCode.OK){loadProduct();querySubscription()}else subscriptionResult(false,"","Google Play no está disponible")};override fun onBillingServiceDisconnected()=Unit})}
    private fun loadProduct() {
        val product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(PRODUCT_MONTHLY)
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        val params = QueryProductDetailsParams.newBuilder().setProductList(listOf(product)).build()
        billingClient.queryProductDetailsAsync(params) { result, response ->
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                monthlyProduct = null
                js("window.onMomentsOfferUnavailable(${quote("No se pudo consultar la suscripción en Google Play.")})")
            } else {
                monthlyProduct = response.productDetailsList.firstOrNull()
                val offer = preferredMonthlyOffer(monthlyProduct)
                val localizedPrice = offer?.pricingPhases?.pricingPhaseList
                    ?.lastOrNull { it.priceAmountMicros > 0L }
                    ?.formattedPrice
                    ?.takeIf { it.isNotBlank() }
                when {
                    offer == null -> js("window.onMomentsOfferUnavailable(${quote("El plan mensual no está disponible en Google Play.")})")
                    localizedPrice == null -> js("window.onMomentsOfferUnavailable(${quote("Google Play no devolvió un precio válido para tu país.")})")
                    else -> js("window.onMomentsOffer(${quote(localizedPrice)},${hasThreeDayTrial(offer)})")
                }
            }
        }
    }
    private fun querySubscription(){if(BuildConfig.DEBUG)return subscriptionResult(true,"4,99 €","Modo de prueba");billingClient.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()){r,purchases->val active=r.responseCode==BillingClient.BillingResponseCode.OK&&purchases.any{it.products.contains(PRODUCT_MONTHLY)&&it.purchaseState==Purchase.PurchaseState.PURCHASED};subscriptionResult(active,"",if(active)"Suscripción activa" else "Suscripción mensual necesaria");purchases.filter{!it.isAcknowledged}.forEach(::acknowledge)}}
    override fun onPurchasesUpdated(r:BillingResult,purchases:List<Purchase>?){if(r.responseCode==BillingClient.BillingResponseCode.OK&&purchases!=null){purchases.forEach(::acknowledge);querySubscription()}else if(r.responseCode!=BillingClient.BillingResponseCode.USER_CANCELED)js("window.onMomentsPurchaseError(${quote(r.debugMessage)})")}
    private fun acknowledge(p:Purchase){if(p.isAcknowledged)return;billingClient.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.purchaseToken).build()){querySubscription()}}
    private fun launchSubscription(){val product=monthlyProduct?:run{loadProduct();js("window.onMomentsPurchaseError(${quote("Espera un momento y vuelve a pulsar Suscribirme.")})");return};val offer=preferredMonthlyOffer(product)?:run{js("window.onMomentsPurchaseError(${quote("El plan mensual no está disponible en Google Play.")})");return};val details=BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product).setOfferToken(offer.offerToken).build();val r=billingClient.launchBillingFlow(this,BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(details)).build());if(r.responseCode!=BillingClient.BillingResponseCode.OK)js("window.onMomentsPurchaseError(${quote("No se pudo abrir el pago de Google Play: "+r.debugMessage)})")}
    private fun hasThreeDayTrial(o:ProductDetails.SubscriptionOfferDetails)=o.pricingPhases.pricingPhaseList.any{it.priceAmountMicros==0L&&it.billingPeriod=="P3D"}
    private fun preferredMonthlyOffer(p:ProductDetails?)=p?.subscriptionOfferDetails.orEmpty().firstOrNull(::hasThreeDayTrial)?:p?.subscriptionOfferDetails.orEmpty().firstOrNull{it.pricingPhases.pricingPhaseList.none{ph->ph.priceAmountMicros==0L}}?:p?.subscriptionOfferDetails.orEmpty().firstOrNull()
    private fun subscriptionResult(active:Boolean,price:String,message:String)=js("window.onMomentsSubscription($active,${quote(price)},${quote(message)})")
    private fun js(code:String)=runOnUiThread{webView.evaluateJavascript(code,null)}
    private fun quote(v:String)="\""+v.replace("\\","\\\\").replace("\"","\\\"")+"\""
    inner class AndroidBridge{
        @JavascriptInterface fun appVersion()="1.1.0"
        @JavascriptInterface fun checkSubscription()=runOnUiThread{connectBilling()}
        @JavascriptInterface fun subscribeMonthly()=runOnUiThread{if(billingClient.isReady)launchSubscription()else connectBilling()}
        @JavascriptInterface fun restorePurchases()=runOnUiThread{if(billingClient.isReady)querySubscription()else connectBilling()}
        @JavascriptInterface fun manageSubscription()=runOnUiThread{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://play.google.com/store/account/subscriptions?sku=$PRODUCT_MONTHLY&package=$packageName")))}
        @JavascriptInterface fun exitApp()=runOnUiThread{finish()}
        @JavascriptInterface fun saveBase64File(fileName:String,mimeType:String,base64:String){val bytes=try{Base64.decode(base64,Base64.DEFAULT)}catch(_:Exception){js("window.onMomentsFileSaved(false,${quote(fileName)})");return};runOnUiThread{if(pendingSaveBytes!=null){js("window.onMomentsPurchaseError(${quote("Termina de guardar el archivo anterior.")})");return@runOnUiThread};pendingSaveBytes=bytes;pendingSaveName=fileName;val safe=fileName.take(120).replace(Regex("[\\\\/:*?\"<>|]"),"_");val intent=Intent(Intent.ACTION_CREATE_DOCUMENT).apply{addCategory(Intent.CATEGORY_OPENABLE);type=mimeType.ifBlank{"application/octet-stream"};putExtra(Intent.EXTRA_TITLE,safe)};try{saveFilePicker.launch(intent)}catch(_:Exception){pendingSaveBytes=null;pendingSaveName="";js("window.onMomentsFileSaved(false,${quote(fileName)})")}}}
    }
    override fun onResume(){super.onResume();if(::billingClient.isInitialized&&!BuildConfig.DEBUG)connectBilling()}
    override fun onDestroy(){if(::billingClient.isInitialized)billingClient.endConnection();super.onDestroy()}
}
