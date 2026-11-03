package com.momentsplanner.events

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
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
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
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
        webView=WebView(this).apply{
            settings.javaScriptEnabled=true;settings.domStorageEnabled=true;settings.allowFileAccess=true;settings.allowContentAccess=true
            webViewClient=object:WebViewClient(){
                override fun onPageFinished(view:WebView?,url:String?){
                    super.onPageFinished(view,url)
                    // La aplicación es de pago único y no necesita comprobar suscripciones.
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
        val root = FrameLayout(this).apply { setBackgroundColor(Color.rgb(22, 14, 32)) }
        root.addView(webView, FrameLayout.LayoutParams(-1, -1))
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
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

    private fun js(code:String)=runOnUiThread{if(::webView.isInitialized && !isDestroyed && !isFinishing)webView.evaluateJavascript(code,null)}
    private fun quote(value: String): String = JSONObject.quote(value)

    inner class AndroidBridge{
        @JavascriptInterface fun appVersion()=BuildConfig.VERSION_NAME
        @JavascriptInterface fun exitApp()=runOnUiThread{finish()}
        @JavascriptInterface fun saveBase64File(fileName:String,mimeType:String,base64:String){val bytes=try{Base64.decode(base64,Base64.DEFAULT)}catch(_:Exception){js("window.onMomentsFileSaved(false,${quote(fileName)})");return};runOnUiThread{if(pendingSaveBytes!=null){js("window.onMomentsFileSaved(false,${quote(fileName)})");return@runOnUiThread};pendingSaveBytes=bytes;pendingSaveName=fileName;val safe=fileName.take(120).replace(Regex("[\\\\/:*?\"<>|]"),"_");val intent=Intent(Intent.ACTION_CREATE_DOCUMENT).apply{addCategory(Intent.CATEGORY_OPENABLE);type=mimeType.ifBlank{"application/octet-stream"};putExtra(Intent.EXTRA_TITLE,safe)};try{saveFilePicker.launch(intent)}catch(_:Exception){pendingSaveBytes=null;pendingSaveName="";js("window.onMomentsFileSaved(false,${quote(fileName)})")}}}
    }
}

