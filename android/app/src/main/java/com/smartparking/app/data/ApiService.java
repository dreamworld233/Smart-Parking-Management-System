package com.smartparking.app.data;

import com.smartparking.app.model.ApiResponse;
import com.smartparking.app.model.AuthResponse;
import com.smartparking.app.model.Car;
import com.smartparking.app.model.User;

import java.util.List;
import java.util.Map;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.DELETE;
import retrofit2.http.GET;
import retrofit2.http.POST;
import retrofit2.http.PUT;
import retrofit2.http.Path;

/**
 * 后端 API 定义。需登录接口由拦截器统一带 token。
 */
public interface ApiService {

    // ---- 认证（公开） ----
    @POST("api/auth/register")
    Call<ApiResponse<AuthResponse>> register(@Body Map<String, String> body);

    @POST("api/auth/login")
    Call<ApiResponse<AuthResponse>> login(@Body Map<String, String> body);

    // ---- 用户资料（需登录） ----
    @GET("api/user/info")
    Call<ApiResponse<User>> userInfo();

    @PUT("api/user/info")
    Call<ApiResponse<User>> updateUserInfo(@Body Map<String, String> body);

    @PUT("api/user/password")
    Call<ApiResponse<Void>> changePassword(@Body Map<String, String> body);

    // ---- 车辆（需登录） ----
    @GET("api/user/vehicles")
    Call<ApiResponse<List<Car>>> vehicles();

    @POST("api/user/vehicles")
    Call<ApiResponse<Car>> bindVehicle(@Body Map<String, String> body);

    @DELETE("api/user/vehicles/{id}")
    Call<ApiResponse<Void>> unbindVehicle(@Path("id") long id);
}
