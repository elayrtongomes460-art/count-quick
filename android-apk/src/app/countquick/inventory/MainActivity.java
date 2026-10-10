package app.countquick.inventory;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.content.ContentValues;
import android.webkit.*;
import android.widget.Toast;
import java.io.OutputStream;
import android.util.Base64;

public class MainActivity extends Activity {
    private static final String HOME = "https://count-quick.lovable.app";
    private WebView web;
    private ValueCallback<Uri[]> chooser;
    private PermissionRequest cameraRequest;

    private boolean trusted(Uri uri) {
        return uri != null && "https".equals(uri.getScheme()) && "count-quick.lovable.app".equals(uri.getHost());
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        setContentView(web);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        web.addJavascriptInterface(new PdfExport(), "AndroidPdf");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                if (trusted(request.getUrl())) return false;
                if ("https".equals(request.getUrl().getScheme()) || "mailto".equals(request.getUrl().getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); } catch (Exception ignored) {}
                }
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) new AlertDialog.Builder(MainActivity.this)
                    .setTitle("Sem conexão").setMessage("Verifique sua internet para abrir o inventário.")
                    .setPositiveButton("Tentar novamente", (d, w) -> web.loadUrl(HOME)).show();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = callback;
                try { startActivityForResult(params.createIntent(), 10); }
                catch (Exception e) { chooser.onReceiveValue(null); chooser = null; }
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (!trusted(request.getOrigin())) { request.deny(); return; }
                    boolean video = false;
                    for (String resource : request.getResources()) if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) video = true;
                    if (!video) { request.deny(); return; }
                    if (checkSelfPermission("android.permission.CAMERA") == PackageManager.PERMISSION_GRANTED)
                        request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                    else { cameraRequest = request; requestPermissions(new String[]{"android.permission.CAMERA"}, 20); }
                });
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (cameraRequest == request) cameraRequest = null;
            }
        });
        web.setDownloadListener((url, agent, disposition, mime, length) -> {
            if (url.startsWith("blob:" + HOME + "/") && trusted(Uri.parse(web.getUrl()))) {
                String quoted = org.json.JSONObject.quote(url);
                web.evaluateJavascript("fetch(" + quoted + ").then(r=>r.blob()).then(b=>{const f=new FileReader();f.onload=()=>AndroidPdf.save(f.result);f.readAsDataURL(b)}).catch(()=>{})", null);
            } else if (trusted(Uri.parse(url))) {
                try {
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    String cookies = CookieManager.getInstance().getCookie(url);
                    if (cookies != null) request.addRequestHeader("Cookie", cookies);
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(url, disposition, mime));
                    ((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(request);
                } catch (Exception e) { Toast.makeText(this, "Não foi possível baixar o arquivo.", Toast.LENGTH_LONG).show(); }
            }
        });
        web.loadUrl(HOME);
    }

    public class PdfExport {
        @JavascriptInterface public void save(String data) {
            if (data == null || data.length() > 30000000 || !data.startsWith("data:application/pdf;base64,")) return;
            runOnUiThread(() -> {
                if (!trusted(Uri.parse(web.getUrl()))) return;
                try {
                    byte[] bytes = Base64.decode(data.substring(data.indexOf(',') + 1), Base64.DEFAULT);
                    if (bytes.length < 5 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F') return;
                    String name = "Inventario-" + System.currentTimeMillis() + ".pdf";
                    if (android.os.Build.VERSION.SDK_INT >= 29) {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                        values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                        Uri destination = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                        if (destination == null) throw new Exception("Destination unavailable");
                        try (OutputStream output = getContentResolver().openOutputStream(destination)) {
                            if (output == null) throw new Exception("Output unavailable");
                            output.write(bytes);
                        }
                        Toast.makeText(MainActivity.this, "PDF salvo em Downloads.", Toast.LENGTH_LONG).show();
                    } else {
                        pendingPdf = bytes;
                        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        intent.setType("application/pdf"); intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.putExtra(Intent.EXTRA_TITLE, name); startActivityForResult(intent, 30);
                    }
                } catch (Exception e) { Toast.makeText(MainActivity.this, "Não foi possível salvar o PDF.", Toast.LENGTH_LONG).show(); }
            });
        }
    }

    private byte[] pendingPdf;
    @Override public void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == 10 && chooser != null) { chooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data)); chooser = null; }
        if (request == 30 && pendingPdf != null) {
            if (result == RESULT_OK && data != null && data.getData() != null) {
                try (OutputStream output = getContentResolver().openOutputStream(data.getData())) {
                    if (output != null) { output.write(pendingPdf); Toast.makeText(this, "PDF salvo.", Toast.LENGTH_LONG).show(); }
                } catch (Exception e) { Toast.makeText(this, "Não foi possível salvar o PDF.", Toast.LENGTH_LONG).show(); }
            }
            pendingPdf = null;
        }
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == 20 && cameraRequest != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) cameraRequest.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else cameraRequest.deny();
            cameraRequest = null;
        }
    }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override public void onPause() { super.onPause(); web.onPause(); CookieManager.getInstance().flush(); }
    @Override public void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override public void onDestroy() { web.destroy(); super.onDestroy(); }
}