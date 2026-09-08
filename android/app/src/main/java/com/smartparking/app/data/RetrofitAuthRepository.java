package com.smartparking.app.data;

import com.smartparking.app.model.ApiResponse;
import com.smartparking.app.model.AuthResponse;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * 真实后端实现：Retrofit 调 Spring Boot 的 /api/auth/register、/api/auth/login。
 * 后端统一返回 HTTP 200 + {code,message,data}，业务错误在 body 的 code 里，
 * 因此这里只把解析结果原样回传，由调用方判 isSuccess()。
 */
public class RetrofitAuthRepository implements AuthRepository {

    private final ApiService api;

    public RetrofitAuthRepository() {
        this.api = ApiClient.service();
    }

    @Override
    public void register(String phone, String password, String carNo, AuthCallback callback) {
        Map<String, String> body = new HashMap<>();
        body.put("phone", phone);
        body.put("password", password);
        body.put("carNo", carNo == null ? "" : carNo);
        enqueue(api.register(body), callback);
    }

    @Override
    public void login(String phone, String password, AuthCallback callback) {
        Map<String, String> body = new HashMap<>();
        body.put("phone", phone);
        body.put("password", password);
        enqueue(api.login(body), callback);
    }

    private void enqueue(Call<ApiResponse<AuthResponse>> call, AuthCallback callback) {
        call.enqueue(new Callback<ApiResponse<AuthResponse>>() {
            @Override
            public void onResponse(Call<ApiResponse<AuthResponse>> c,
                                   Response<ApiResponse<AuthResponse>> response) {
                // 后端业务失败也返回 200，正常解析
                if (response.isSuccessful() && response.body() != null) {
                    callback.onSuccess(response.body());
                } else {
                    callback.onError("服务器响应异常(" + response.code() + ")");
                }
            }

            @Override
            public void onFailure(Call<ApiResponse<AuthResponse>> c, Throwable t) {
                if (t instanceof IOException) {
                    callback.onError("无法连接服务器，请确认后端已启动");
                } else {
                    callback.onError("请求失败：" + t.getMessage());
                }
            }
        });
    }
}
