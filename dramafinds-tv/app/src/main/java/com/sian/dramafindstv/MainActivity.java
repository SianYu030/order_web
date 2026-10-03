package com.sian.dramafindstv;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://dramafinds.com/zh-TW";

    private FrameLayout root;
    private WebView webView;
    private ProgressBar progressBar;
    private LinearLayout errorPanel;
    private TextView errorText;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private boolean tvNavigationReady = false;

    private static final String TV_NAV_JS =
        "(function(){"
        + "if(window.__dfTVInstalled){if(window.__dfTVPrepare)window.__dfTVPrepare();return;}"
        + "window.__dfTVInstalled=true;"
        + "var st=document.createElement('style');"
        + "st.id='df-tv-style';"
        + "st.textContent='*:focus{outline:4px solid #00e5ff!important;outline-offset:3px!important;box-shadow:0 0 0 3px rgba(0,0,0,.75),0 0 18px rgba(0,229,255,.95)!important;}';"
        + "(document.head||document.documentElement).appendChild(st);"
        + "function visible(e){if(!e||!e.getBoundingClientRect)return false;var r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden'&&parseFloat(s.opacity||'1')>0;}"
        + "window.__dfTVPrepare=function(){var q='a[href],button,input,select,textarea,[role=button],[onclick],video,[tabindex]';var a=document.querySelectorAll(q);for(var i=0;i<a.length;i++){var e=a[i];if(visible(e)&&!e.disabled&&!e.hasAttribute('tabindex'))e.setAttribute('tabindex','0');}};"
        + "function items(){window.__dfTVPrepare();var q='a[href],button,input,select,textarea,[role=button],[onclick],video,[tabindex]';return Array.prototype.filter.call(document.querySelectorAll(q),function(e){return visible(e)&&!e.disabled&&e.tabIndex>=0;});}"
        + "function center(e){var r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};}"
        + "function focusEl(e){if(!e)return false;try{e.focus({preventScroll:true});}catch(x){try{e.focus();}catch(y){}}try{e.scrollIntoView({block:'center',inline:'center',behavior:'smooth'});}catch(z){e.scrollIntoView();}return true;}"
        + "window.__dfTVMove=function(d){var a=items();if(!a.length)return false;var c=document.activeElement;if(a.indexOf(c)<0)return focusEl(a[0]);var p=center(c),best=null,bestScore=1e12;for(var i=0;i<a.length;i++){var e=a[i];if(e===c)continue;var t=center(e),dx=t.x-p.x,dy=t.y-p.y,primary=0,secondary=0;if(d==='left'&&dx<0){primary=-dx;secondary=Math.abs(dy);}else if(d==='right'&&dx>0){primary=dx;secondary=Math.abs(dy);}else if(d==='up'&&dy<0){primary=-dy;secondary=Math.abs(dx);}else if(d==='down'&&dy>0){primary=dy;secondary=Math.abs(dx);}else continue;var score=primary+(secondary*0.42);if(secondary>primary*2.8)score+=secondary*1.5;if(score<bestScore){bestScore=score;best=e;}}return focusEl(best);};"
        + "window.__dfTVClick=function(){var e=document.activeElement;if(!e||e===document.body||e===document.documentElement){var a=items();return a.length?focusEl(a[0]):false;}try{e.click();return true;}catch(x){return false;}};"
        + "window.__dfTVPrepare();"
        + "try{new MutationObserver(function(){window.__dfTVPrepare();}).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}"
        + "setTimeout(function(){var a=items();if(a.length&&(document.activeElement===document.body||document.activeElement===document.documentElement))focusEl(a[0]);},650);"
        + "})();";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        buildUi();
        configureWebView();

        if (savedInstanceState == null) {
            webView.loadUrl(HOME_URL);
        } else if (webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(HOME_URL);
        }
        enterImmersive();
    }

    private void buildUi() {
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        FrameLayout.LayoutParams pp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 8);
        pp.gravity = Gravity.TOP;
        root.addView(progressBar, pp);

        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(48, 48, 48, 48);
        errorPanel.setBackgroundColor(Color.rgb(17, 17, 24));
        errorPanel.setVisibility(View.GONE);

        TextView title = new TextView(this);
        title.setText("DramaFinds TV");
        title.setTextColor(Color.WHITE);
        title.setTextSize(28);
        title.setGravity(Gravity.CENTER);
        errorPanel.addView(title, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        errorText = new TextView(this);
        errorText.setTextColor(Color.LTGRAY);
        errorText.setTextSize(18);
        errorText.setGravity(Gravity.CENTER);
        errorText.setPadding(0, 24, 0, 24);
        errorPanel.addView(errorText, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button retry = new Button(this);
        retry.setText("重新載入");
        retry.setTextSize(18);
        retry.setFocusable(true);
        retry.setOnClickListener(v -> {
            errorPanel.setVisibility(View.GONE);
            String url = webView.getUrl();
            if (url == null || url.trim().isEmpty()) webView.loadUrl(HOME_URL);
            else webView.reload();
        });
        errorPanel.addView(retry, new LinearLayout.LayoutParams(320, 84));

        root.addView(errorPanel, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void configureWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        String ua = s.getUserAgentString();
        if (ua != null) {
            ua = ua.replace("; wv", "").replace("Version/4.0 ", "");
            s.setUserAgentString(ua + " DramaFindsTV/1.0");
        }

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                webView.setVisibility(View.GONE);
                errorPanel.setVisibility(View.GONE);
                root.addView(customView, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));
                enterImmersive();
            }

            @Override
            public void onHideCustomView() {
                hideCustomView();
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                errorPanel.setVisibility(View.GONE);
                tvNavigationReady = false;
                view.evaluateJavascript(TV_NAV_JS, value -> {
                    tvNavigationReady = true;
                    view.requestFocus();
                });
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    showError("頁面載入失敗，請檢查網路後重新載入。\n" + error.getDescription());
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                showError("安全連線驗證失敗，為了安全已停止載入。");
            }
        });

        webView.requestFocus();
    }

    private boolean handleNavigation(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        String host = uri.getHost();

        if (("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))
                && host != null
                && (host.equalsIgnoreCase("dramafinds.com")
                || host.toLowerCase().endsWith(".dramafinds.com"))) {
            return false;
        }

        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }

    private void showError(String message) {
        tvNavigationReady = false;
        errorText.setText(message);
        errorPanel.setVisibility(View.VISIBLE);
        errorPanel.bringToFront();
    }

    private void hideCustomView() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        webView.setVisibility(View.VISIBLE);
        if (customViewCallback != null) {
            customViewCallback.onCustomViewHidden();
            customViewCallback = null;
        }
        webView.requestFocus();
        enterImmersive();
    }

    private void enterImmersive() {
        root.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN && customView == null && tvNavigationReady) {
            String dir = null;
            switch (event.getKeyCode()) {
                case KeyEvent.KEYCODE_DPAD_LEFT: dir = "left"; break;
                case KeyEvent.KEYCODE_DPAD_RIGHT: dir = "right"; break;
                case KeyEvent.KEYCODE_DPAD_UP: dir = "up"; break;
                case KeyEvent.KEYCODE_DPAD_DOWN: dir = "down"; break;
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_NUMPAD_ENTER:
                    webView.evaluateJavascript("window.__dfTVClick&&window.__dfTVClick()", null);
                    return true;
                default:
                    break;
            }
            if (dir != null) {
                webView.evaluateJavascript("window.__dfTVMove&&window.__dfTVMove('" + dir + "')", null);
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            hideCustomView();
        } else if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        enterImmersive();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
