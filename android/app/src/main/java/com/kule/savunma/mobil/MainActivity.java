package com.kule.savunma.mobil;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Su Altı Savunma'nın Android kabuğu: oyun, uygulamanın içindeki web dosyalarından (assets) bir WebView'da çalışır.
 *
 * Dosyalar "https://appassets.androidplatform.net" adresinden sunulur. Böylece sayfa güvenli bağlamdadır
 * (Web Audio, Worker ve localStorage çalışır) ve internete hiç çıkılmaz. Ekran yataydır, sistem çubukları gizlidir,
 * oyun sürerken ekran kapanmaz. Geri tuşu önce oyunun kendi penceresini kapatır (Platform.back), kapatacak bir şey yoksa
 * uygulamayı arka plana atar. Uygulama arka plana gidince ses kesilir ve oyun duraklar.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#020A12"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " SASApp/2.1");
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);     // chrome://inspect ile hata ayıklama (yalnızca debug sürümü)
        }

        web.addJavascriptInterface(new Kopru(), "SASApp");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return dosyaSun(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !HOST.equals(request.getUrl().getHost());      // dış bağlantıya gidilmez
            }
        });
        web.loadUrl("https://" + HOST + "/index.html");
        sistemCubuklariniGizle();
    }

    /** Sayfanın çağırabildiği tek yer: Çıkış düğmesi. */
    private class Kopru {
        @JavascriptInterface
        public void exit() {
            runOnUiThread(MainActivity.this::finish);
        }
    }

    // ------------------------------------------------------------------ dosya sunumu

    private static final Map<String, String> MIME = new HashMap<>();

    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("ico", "image/x-icon");
        MIME.put("svg", "image/svg+xml");
        MIME.put("wav", "audio/wav");
    }

    private static String mimeOf(String path) {
        int dot = path.lastIndexOf('.');
        String ext = dot < 0 ? "" : path.substring(dot + 1).toLowerCase(Locale.ROOT);
        String m = MIME.get(ext);
        if (m == null) {
            m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        }
        return m == null ? "application/octet-stream" : m;
    }

    private WebResourceResponse dosyaSun(Uri uri) {
        if (!HOST.equals(uri.getHost())) {
            return yanit(404, "Not Found", "text/plain", new ByteArrayInputStream(new byte[0]));    // çevrimdışı: dışarı istek yok
        }
        String path = uri.getPath();
        if (path == null || path.equals("/")) {
            path = "/index.html";
        }
        try {
            InputStream in = getAssets().open(path.substring(1));
            String mime = mimeOf(path);
            WebResourceResponse r = new WebResourceResponse(mime, mime.startsWith("text/") || mime.contains("json") ? "utf-8" : null, in);
            Map<String, String> h = new HashMap<>();
            h.put("Cache-Control", "no-cache");
            r.setResponseHeaders(h);
            return r;
        } catch (IOException e) {
            return yanit(404, "Not Found", "text/plain", new ByteArrayInputStream(new byte[0]));
        }
    }

    private static WebResourceResponse yanit(int code, String reason, String mime, InputStream body) {
        return new WebResourceResponse(mime, "utf-8", code, reason, new HashMap<>(), body);
    }

    // ------------------------------------------------------------------ sistem arayüzü ve yaşam döngüsü

    private void sistemCubuklariniGizle() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    private void js(String code) {
        if (web != null) {
            web.evaluateJavascript("try{" + code + "}catch(e){}", null);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            sistemCubuklariniGizle();
        }
        js("Platform.windowFocus(" + hasFocus + ")");       // bildirim çekmecesi vb. açılınca ses kesilir, oyun duraklar
    }

    @Override
    protected void onPause() {
        js("Platform.windowFocus(false)");
        if (web != null) {
            web.onPause();
            web.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.resumeTimers();
            web.onResume();
        }
        sistemCubuklariniGizle();
        js("Platform.windowFocus(true)");
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("Platform.back()", value -> {
            if (!"true".equals(value)) {
                moveTaskToBack(true);         // kapatılacak bir şey yoksa uygulama arka plana gider
            }
        });
    }
}
