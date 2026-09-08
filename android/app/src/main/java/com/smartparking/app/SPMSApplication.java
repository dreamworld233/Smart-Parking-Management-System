package com.smartparking.app;

import android.app.Application;
import android.content.Context;

/**
 * 应用入口：缓存全局 context，供 ApiClient 拦截器读 token 等无 Activity 场景使用。
 */
public class SPMSApplication extends Application {

    private static Context appContext;

    @Override
    public void onCreate() {
        super.onCreate();
        appContext = getApplicationContext();
    }

    public static Context get() {
        return appContext;
    }
}
