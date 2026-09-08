package com.smartparking.app.data;

import com.smartparking.app.model.ApiResponse;
import com.smartparking.app.model.AuthResponse;

import java.util.Map;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.POST;

/**
 * 后端认证接口定义。
 * 请求体用 Map 传参（phone/password[/carNo]），返回统一 {@link ApiResponse}。
 */
public interface ApiService {

    @POST("api/auth/register")
    Call<ApiResponse<AuthResponse>> register(@Body Map<String, String> body);

    @POST("api/auth/login")
    Call<ApiResponse<AuthResponse>> login(@Body Map<String, String> body);
}
