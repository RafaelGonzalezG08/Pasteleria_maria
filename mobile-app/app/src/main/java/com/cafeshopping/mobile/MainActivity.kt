package com.cafeshopping.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.provider.MediaStore
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.ProgressBar
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.activity.result.contract.ActivityResultContracts
import java.io.ByteArrayInputStream
import java.io.File
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate

/**
 * Una sola pantalla: un WebView a toda la app de Cafe Shopping.
 *
 * No usamos un certificado fijo porque el que genera la PC (ver
 * desktop/nativo.js -> obtenerCertificadoTls) cambia si cambia la IP. En vez
 * de eso, se confia "a la SSH": la primera vez que se ve una direccion se
 * pregunta y se guarda su huella; despues, si coincide entra directo, y si
 * cambia se avisa en vez de fallar en silencio o confiar ciego.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progress: ProgressBar
    private lateinit var setupOverlay: LinearLayout
    private lateinit var addressInput: EditText
    private lateinit var menuButton: Button

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var fotoCapturaPendiente: Uri? = null

    private val prefs by lazy { getSharedPreferences("cafe_shopping", MODE_PRIVATE) }

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = filePathCallback
            filePathCallback = null
            if (callback == null) return@registerForActivityResult

            if (result.resultCode != Activity.RESULT_OK) {
                callback.onReceiveValue(null)
                return@registerForActivityResult
            }
            val data = result.data
            val uris: Array<Uri> = when {
                data?.clipData != null -> {
                    val clip = data.clipData!!
                    Array(clip.itemCount) { i -> clip.getItemAt(i).uri }
                }
                data?.data != null -> arrayOf(data.data!!)
                fotoCapturaPendiente != null -> arrayOf(fotoCapturaPendiente!!)
                else -> emptyArray()
            }
            callback.onReceiveValue(uris)
        }

    private val cameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        progress = findViewById(R.id.progress)
        setupOverlay = findViewById(R.id.setupOverlay)
        addressInput = findViewById(R.id.addressInput)
        menuButton = findViewById(R.id.menuButton)

        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            cameraPermissionLauncher.launch(android.Manifest.permission.CAMERA)
        }

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        webView.webViewClient = crearWebViewClient()
        webView.webChromeClient = crearWebChromeClient()

        findViewById<Button>(R.id.connectButton).setOnClickListener { conectar() }
        menuButton.setOnClickListener { mostrarMenuOpciones(it) }

        val guardada = prefs.getString(CLAVE_DIRECCION, null)
        if (guardada != null) {
            mostrarWebView(guardada)
        } else {
            mostrarConfiguracion()
        }

        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.visibility == View.VISIBLE && webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(0, MENU_CAMBIAR_DIRECCION, 0, "Cambiar dirección")
        menu.add(0, MENU_OLVIDAR_CERTIFICADO, 1, "Olvidar certificado de confianza")
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        ejecutarAccionMenu(item.itemId)
        return true
    }

    /**
     * La app usa el tema NoActionBar (sin barra superior), asi que el menu de
     * opciones de onCreateOptionsMenu no tiene donde mostrarse en la mayoria
     * de los telefonos. Este boton flotante (arriba a la derecha del WebView)
     * es el punto de entrada real a estas mismas opciones.
     */
    private fun mostrarMenuOpciones(anchor: View) {
        val popup = PopupMenu(this, anchor)
        popup.menu.add(0, MENU_CAMBIAR_DIRECCION, 0, "Cambiar dirección")
        popup.menu.add(0, MENU_OLVIDAR_CERTIFICADO, 1, "Olvidar certificado de confianza")
        popup.setOnMenuItemClickListener { item -> ejecutarAccionMenu(item.itemId) }
        popup.show()
    }

    private fun ejecutarAccionMenu(itemId: Int): Boolean {
        when (itemId) {
            MENU_CAMBIAR_DIRECCION -> {
                prefs.edit().remove(CLAVE_DIRECCION).apply()
                mostrarConfiguracion()
            }
            MENU_OLVIDAR_CERTIFICADO -> {
                val direccion = prefs.getString(CLAVE_DIRECCION, null)
                if (direccion != null) {
                    val host = Uri.parse(direccion).host
                    prefs.edit().remove(CLAVE_HUELLA_PREFIX + host).apply()
                    Toast.makeText(this, "Certificado olvidado. Se preguntará de nuevo.", Toast.LENGTH_SHORT).show()
                }
            }
        }
        return true
    }

    private fun mostrarConfiguracion() {
        setupOverlay.visibility = View.VISIBLE
        webView.visibility = View.GONE
        menuButton.visibility = View.GONE
        val actual = prefs.getString(CLAVE_DIRECCION, null)
        if (actual != null) addressInput.setText(actual)
    }

    private fun conectar() {
        var direccion = addressInput.text.toString().trim()
        if (direccion.isEmpty()) {
            Toast.makeText(this, "Escribe la dirección que muestra Configuración.", Toast.LENGTH_SHORT).show()
            return
        }
        if (!direccion.startsWith("https://")) direccion = "https://$direccion"
        prefs.edit().putString(CLAVE_DIRECCION, direccion).apply()
        mostrarWebView(direccion)
    }

    private fun mostrarWebView(direccion: String) {
        setupOverlay.visibility = View.GONE
        webView.visibility = View.VISIBLE
        menuButton.visibility = View.VISIBLE
        webView.loadUrl(direccion)
    }

    private fun crearWebViewClient() = object : WebViewClient() {
        override fun onPageFinished(view: WebView?, url: String?) {
            progress.visibility = View.GONE
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            val huella = huellaDe(error) ?: return handler.cancel()
            val direccionGuardada = prefs.getString(CLAVE_DIRECCION, null) ?: return handler.cancel()
            val host = Uri.parse(direccionGuardada).host ?: return handler.cancel()
            val clave = CLAVE_HUELLA_PREFIX + host
            val guardada = prefs.getString(clave, null)

            when {
                guardada == null -> {
                    AlertDialog.Builder(this@MainActivity)
                        .setTitle("¿Confiar en esta PC?")
                        .setMessage(
                            "Primera vez que te conectas a $host.\n\nHuella del certificado:\n$huella\n\n" +
                                "Confirma solo si es la PC de tu negocio.",
                        )
                        .setPositiveButton("Confiar") { _, _ ->
                            prefs.edit().putString(clave, huella).apply()
                            handler.proceed()
                        }
                        .setNegativeButton("Cancelar") { _, _ -> handler.cancel() }
                        .setCancelable(false)
                        .show()
                }
                guardada == huella -> handler.proceed()
                else -> {
                    AlertDialog.Builder(this@MainActivity)
                        .setTitle("El certificado cambió")
                        .setMessage(
                            "La huella de $host ya no es la que conocías. " +
                                "Puede ser normal (se reinstaló la app en la PC), pero confirma que sigue siendo tu negocio.\n\n" +
                                "Huella nueva:\n$huella",
                        )
                        .setPositiveButton("Sigue siendo mi PC") { _, _ ->
                            prefs.edit().putString(clave, huella).apply()
                            handler.proceed()
                        }
                        .setNegativeButton("Cancelar") { _, _ -> handler.cancel() }
                        .setCancelable(false)
                        .show()
                }
            }
        }
    }

    private fun huellaDe(error: SslError): String? {
        return try {
            val bundle = android.net.http.SslCertificate.saveState(error.certificate)
            val bytes = bundle.getByteArray("x509-certificate") ?: return null
            val cert = CertificateFactory.getInstance("X.509")
                .generateCertificate(ByteArrayInputStream(bytes)) as X509Certificate
            MessageDigest.getInstance("SHA-256").digest(cert.encoded)
                .joinToString(":") { "%02X".format(it) }
        } catch (e: Exception) {
            null
        }
    }

    private fun crearWebChromeClient() = object : WebChromeClient() {
        override fun onProgressChanged(view: WebView?, newProgress: Int) {
            progress.visibility = if (newProgress < 100) View.VISIBLE else View.GONE
        }

        override fun onShowFileChooser(
            webView: WebView?,
            callback: ValueCallback<Array<Uri>>,
            params: FileChooserParams?,
        ): Boolean {
            filePathCallback = callback
            fotoCapturaPendiente = null

            val galeria = Intent(Intent.ACTION_GET_CONTENT).apply {
                type = "image/*"
                addCategory(Intent.CATEGORY_OPENABLE)
            }

            var camara: Intent? = null
            try {
                val archivo = File.createTempFile("foto_", ".jpg", cacheDir)
                fotoCapturaPendiente = androidx.core.content.FileProvider.getUriForFile(
                    this@MainActivity,
                    "$packageName.fileprovider",
                    archivo,
                )
                camara = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                    putExtra(MediaStore.EXTRA_OUTPUT, fotoCapturaPendiente)
                    addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                }
            } catch (e: Exception) {
                // Sin camara disponible: se deja solo la galeria.
            }

            val chooser = Intent.createChooser(galeria, "Elegir foto")
            if (camara != null) {
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(camara))
            }
            fileChooserLauncher.launch(chooser)
            return true
        }
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val CLAVE_DIRECCION = "direccion"
        private const val CLAVE_HUELLA_PREFIX = "huella_"
        private const val MENU_CAMBIAR_DIRECCION = 1
        private const val MENU_OLVIDAR_CERTIFICADO = 2
    }
}
