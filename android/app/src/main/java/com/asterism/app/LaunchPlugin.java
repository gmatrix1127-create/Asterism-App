package com.asterism.app;

import android.content.res.Resources;
import android.os.Build;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** 网页和启动画面之间的两件事：告诉原生端“网页准备好了”、记住 app 内选的深浅色。 */
@CapacitorPlugin(name = "Launch")
public class LaunchPlugin extends Plugin {

    // 网页首屏画好后调用；等启动画面开始淡出时才返回，网页借此安排入场动画
    @PluginMethod
    public void ready(PluginCall call) {
        ((MainActivity) getActivity()).onWebReady(call::resolve);
    }

    // theme: system / light / dark。安卓 13 起系统会记住，下次启动画面直接用对应的颜色
    @PluginMethod
    public void setTheme(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            String theme = call.getString("theme", "system");
            int id = "dark".equals(theme) ? R.style.SplashNight : "light".equals(theme) ? R.style.SplashDay : Resources.ID_NULL;
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().getSplashScreen().setSplashScreenTheme(id);
                } catch (Exception ignored) {}
            });
        }
        call.resolve();
    }
}
