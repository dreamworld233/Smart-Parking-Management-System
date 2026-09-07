package com.smartparking.app.util;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * 登录态管理：SharedPreferences 存 token + 手机号。
 * 接真实后端后 token 换成 JWT，这里只是存取封装，不影响调用方。
 */
public class TokenManager {

    private static final String PREF_NAME = "smartparking_auth";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_PHONE = "phone";

    private TokenManager() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    public static void save(Context context, String token, String phone) {
        prefs(context).edit()
                .putString(KEY_TOKEN, token)
                .putString(KEY_PHONE, phone)
                .apply();
    }

    public static String getToken(Context context) {
        return prefs(context).getString(KEY_TOKEN, null);
    }

    public static String getPhone(Context context) {
        return prefs(context).getString(KEY_PHONE, null);
    }

    public static boolean isLoggedIn(Context context) {
        return getToken(context) != null;
    }

    public static void clear(Context context) {
        prefs(context).edit().clear().apply();
    }
}
