package com.asterism.app;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ObjectAnimator;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.webkit.WebView;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.splashscreen.SplashScreenViewProvider;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 沉浸式状态栏：网页一直画到状态栏、导航栏下面，系统栏的高度通过 CSS 变量
 * --safe-area-inset-* 告诉网页，由网页自己留出位置。
 * （Capacitor 自带的处理在 WebView 140 以下会退回成“给状态栏留白”，所以这里自己做。）
 *
 * 启动画面：一直留到网页首屏画好（LaunchPlugin.ready），等 Logo 画完再整体淡出，
 * 淡出开始时通知网页让内容入场，这样不会露出空白页。
 */
public class MainActivity extends BridgeActivity {

    private static final long MAX_SPLASH_MS = 3000;   // 网页再慢，启动画面也最多停这么久
    private static final long LOGO_HOLD_MS = 120;     // Logo 画完后停一下再淡出
    private static final long FADE_MS = 380;

    private int insetTop, insetRight, insetBottom, insetLeft; // 单位 dp

    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<Runnable> revealWaiters = new ArrayList<>();
    private long createdAt;
    private volatile boolean webReady;
    private boolean revealed;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        createdAt = SystemClock.uptimeMillis();
        splash.setKeepOnScreenCondition(() -> !webReady && SystemClock.uptimeMillis() - createdAt < MAX_SPLASH_MS);
        splash.setOnExitAnimationListener(this::playSplashExit);
        registerPlugin(LaunchPlugin.class);
        registerPlugin(GalleryPlugin.class);
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        View decor = window.getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            boolean imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            int imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;

            // 键盘弹出时把网页底部抬到键盘上方（相当于 adjustResize）
            v.setPadding(0, 0, 0, imeVisible ? imeBottom : 0);

            float density = getResources().getDisplayMetrics().density;
            insetTop = Math.round(bars.top / density);
            insetRight = Math.round(bars.right / density);
            insetLeft = Math.round(bars.left / density);
            insetBottom = imeVisible ? 0 : Math.round(bars.bottom / density);
            injectInsets();

            // 不能直接返回 CONSUMED（会让 WebView 之后收不到更新），按 Capacitor 的做法把系统栏部分清零
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
                .build();
        });

        // 页面（重新）加载后再注入一次，避免变量丢失
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                injectInsets();
            }

            @Override
            public void onPageLoaded(WebView webView) {
                injectInsets();
            }
        });
        ViewCompat.requestApplyInsets(decor);

        // 网页还没画出来的那一瞬间也是页面底色，而不是白色
        WebView webView = bridge.getWebView();
        if (webView != null) webView.setBackgroundColor(ContextCompat.getColor(this, R.color.app_bg));
    }

    /** LaunchPlugin 调用：网页首屏已画好；onReveal 在启动画面开始淡出时执行。 */
    void onWebReady(Runnable onReveal) {
        main.post(() -> {
            webReady = true;
            if (revealed) {
                onReveal.run();
                return;
            }
            revealWaiters.add(onReveal);
            // 系统没显示启动画面时（比如热启动），也别让网页一直等
            main.postDelayed(this::reveal, 1500);
            getWindow().getDecorView().invalidate();
        });
    }

    private void reveal() {
        revealed = true;
        for (Runnable r : revealWaiters) r.run();
        revealWaiters.clear();
    }

    private void playSplashExit(SplashScreenViewProvider splash) {
        // Logo 还没画完就等它画完
        long remain = 0;
        try {
            long start = splash.getIconAnimationStartMillis();
            if (start > 0) remain = start + splash.getIconAnimationDurationMillis() - System.currentTimeMillis();
        } catch (Exception ignored) {}
        long delay = Math.max(0, Math.min(remain + LOGO_HOLD_MS, 900));
        main.postDelayed(this::reveal, delay);

        DecelerateInterpolator ease = new DecelerateInterpolator(1.6f);
        splash.getView().animate().alpha(0f).setStartDelay(delay).setDuration(FADE_MS).setInterpolator(ease)
            .setListener(new AnimatorListenerAdapter() {
                private boolean done;

                @Override
                public void onAnimationEnd(Animator animation) {
                    if (done) return;
                    done = true;
                    splash.remove();
                }
            }).start();
        // 会动的 Logo 在系统里是单独一层（SurfaceView），不跟着父布局变透明，
        // 必须对它本身调用 setAlpha 才会一起淡出（ObjectAnimator 走的就是 setAlpha）
        try {
            View icon = splash.getIconView();
            ObjectAnimator fade = ObjectAnimator.ofFloat(icon, View.ALPHA, 1f, 0f);
            fade.setStartDelay(delay);
            fade.setDuration(FADE_MS);
            fade.setInterpolator(ease);
            fade.start();
        } catch (Exception ignored) {}
    }

    private void injectInsets() {
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        if (webView == null) return;
        String js = String.format(
            Locale.US,
            "(function(s){s.setProperty('--safe-area-inset-top','%dpx');s.setProperty('--safe-area-inset-right','%dpx');" +
            "s.setProperty('--safe-area-inset-bottom','%dpx');s.setProperty('--safe-area-inset-left','%dpx');})(document.documentElement.style);",
            insetTop, insetRight, insetBottom, insetLeft
        );
        webView.post(() -> webView.evaluateJavascript(js, null));
    }
}
