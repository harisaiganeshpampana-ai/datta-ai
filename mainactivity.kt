// MainActivity.kt
// Place in: android/app/src/main/java/com/datta/ai/MainActivity.kt

package com.datta.ai

import android.os.Bundle
import android.util.Log
import com.android.billingclient.api.*
import com.getcapacitor.BridgeActivity
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : BridgeActivity(), PurchasesUpdatedListener {

    private lateinit var billingClient: BillingClient
    private val TAG = "DattaBilling"
    private val BACKEND_URL = "https://datta-ai-server.onrender.com"

    // Product IDs — must match exactly what you create in Play Console
    private val PRODUCT_IDS = listOf("datta_plus_monthly", "datta_pro_monthly")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setupBilling()
    }

    // ── SETUP BILLING CLIENT ──────────────────────────────────────────────────
    private fun setupBilling() {
        billingClient = BillingClient.newBuilder(this)
            .setListener(this)
            .enablePendingPurchases()
            .build()

        connectBilling()
    }

    private fun connectBilling() {
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    Log.d(TAG, "Billing connected")
                    // Restore any existing purchases on connect
                    restorePurchases()
                } else {
                    Log.e(TAG, "Billing setup failed: ${result.debugMessage}")
                }
            }
            override fun onBillingServiceDisconnected() {
                Log.w(TAG, "Billing disconnected — retrying in 3s")
                // Retry after delay
                android.os.Handler(mainLooper).postDelayed({ connectBilling() }, 3000)
            }
        })
    }

    // ── LAUNCH PURCHASE FLOW ──────────────────────────────────────────────────
    // Call this from JavaScript via Capacitor plugin or WebView bridge
    fun launchPurchase(productId: String) {
        val productList = listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        )

        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(productList)
            .build()

        billingClient.queryProductDetailsAsync(params) { billingResult, productDetailsList ->
            if (billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
                Log.e(TAG, "Failed to query products: ${billingResult.debugMessage}")
                return@queryProductDetailsAsync
            }

            val productDetails = productDetailsList.firstOrNull() ?: return@queryProductDetailsAsync

            val offerToken = productDetails.subscriptionOfferDetails?.firstOrNull()?.offerToken ?: ""
            val productDetailsParamsList = listOf(
                BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(productDetails)
                    .setOfferToken(offerToken)
                    .build()
            )

            val billingFlowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(productDetailsParamsList)
                .build()

            runOnUiThread {
                billingClient.launchBillingFlow(this, billingFlowParams)
            }
        }
    }

    // ── HANDLE PURCHASE RESULT ────────────────────────────────────────────────
    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                purchases?.forEach { purchase ->
                    if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
                        handlePurchase(purchase)
                    }
                }
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> {
                Log.d(TAG, "Purchase cancelled by user")
                notifyWebView("purchase_cancelled", null)
            }
            else -> {
                Log.e(TAG, "Purchase error: ${result.debugMessage}")
                notifyWebView("purchase_error", result.debugMessage)
            }
        }
    }

    private fun handlePurchase(purchase: Purchase) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val productId = purchase.products.firstOrNull() ?: return@launch
                val token = getStoredAuthToken()

                // Verify with backend — NEVER trust locally
                val response = verifyWithBackend(
                    purchaseToken = purchase.purchaseToken,
                    productId = productId,
                    authToken = token
                )

                if (response.optBoolean("success")) {
                    val plan = response.optString("plan")
                    // Acknowledge the purchase (required by Play Billing)
                    acknowledgePurchase(purchase)
                    Log.d(TAG, "Purchase verified: $productId → $plan")
                    notifyWebView("purchase_success", plan)
                } else {
                    Log.e(TAG, "Backend verification failed: $response")
                    notifyWebView("purchase_error", "Verification failed")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Purchase handling error: ${e.message}")
                notifyWebView("purchase_error", e.message)
            }
        }
    }

    private fun acknowledgePurchase(purchase: Purchase) {
        if (purchase.isAcknowledged) return
        val params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken)
            .build()
        billingClient.acknowledgePurchase(params) { result ->
            Log.d(TAG, "Acknowledge result: ${result.responseCode}")
        }
    }

    // ── RESTORE PURCHASES ─────────────────────────────────────────────────────
    private fun restorePurchases() {
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()

        billingClient.queryPurchasesAsync(params) { _, purchases ->
            val activePurchase = purchases.firstOrNull {
                it.purchaseState == Purchase.PurchaseState.PURCHASED
            }

            if (activePurchase != null) {
                CoroutineScope(Dispatchers.IO).launch {
                    try {
                        val token = getStoredAuthToken()
                        val productId = activePurchase.products.firstOrNull() ?: return@launch
                        val response = restoreWithBackend(activePurchase.purchaseToken, productId, token)
                        val plan = response.optString("plan", "free")
                        Log.d(TAG, "Restored plan: $plan")
                        notifyWebView("plan_restored", plan)
                    } catch (e: Exception) {
                        Log.e(TAG, "Restore error: ${e.message}")
                    }
                }
            }
        }
    }

    // ── BACKEND CALLS ─────────────────────────────────────────────────────────
    private fun verifyWithBackend(purchaseToken: String, productId: String, authToken: String): JSONObject {
        return postToBackend(
            endpoint = "/verify-purchase",
            body = JSONObject().apply {
                put("purchaseToken", purchaseToken)
                put("productId", productId)
                put("token", authToken)
            }
        )
    }

    private fun restoreWithBackend(purchaseToken: String, productId: String, authToken: String): JSONObject {
        return postToBackend(
            endpoint = "/restore-purchases",
            body = JSONObject().apply {
                put("purchaseToken", purchaseToken)
                put("productId", productId)
                put("token", authToken)
            }
        )
    }

    private fun postToBackend(endpoint: String, body: JSONObject): JSONObject {
        val url = URL("$BACKEND_URL$endpoint")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json")
        conn.doOutput = true
        conn.connectTimeout = 15000
        conn.readTimeout = 15000

        OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }

        return if (conn.responseCode == 200) {
            JSONObject(conn.inputStream.bufferedReader().readText())
        } else {
            JSONObject().put("error", "HTTP ${conn.responseCode}")
        }
    }

    // ── HELPERS ───────────────────────────────────────────────────────────────
    private fun getStoredAuthToken(): String {
        // Read token stored by the web app in WebView localStorage
        val prefs = getSharedPreferences("datta_prefs", MODE_PRIVATE)
        return prefs.getString("datta_token", "") ?: ""
    }

    private fun notifyWebView(event: String, data: String?) {
        runOnUiThread {
            val js = "window.dispatchEvent(new CustomEvent('play_billing', {detail:{event:'$event',data:'${data ?: ""}'}}))"
            bridge.webView.evaluateJavascript(js, null)
        }
    }
}
