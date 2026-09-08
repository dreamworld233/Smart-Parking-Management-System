package com.smartparking.app.data;

import com.smartparking.app.model.ApiResponse;
import com.smartparking.app.model.AuthResponse;

/**
 * 登录/注册抽象（异步）。
 * 网络不可在主线程同步执行，统一走回调：成功后回 {@link AuthCallback#onSuccess}，
 * 网络异常/超时回 {@link AuthCallback#onError}（业务失败如"密码错误"走 onSuccess 的 code）。
 */
public interface AuthRepository {

    void register(String phone, String password, String carNo, AuthCallback callback);

    void login(String phone, String password, AuthCallback callback);

    interface AuthCallback {
        /** 请求已返回（可能业务失败，看 response.isSuccess()）。回调在 UI 线程。 */
        void onSuccess(ApiResponse<AuthResponse> response);

        /** 网络不通 / 超时 / 响应解析失败。回调在 UI 线程。 */
        void onError(String message);
    }
}
