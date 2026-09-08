package com.smartparking.app.data;

import com.smartparking.app.model.ApiResponse;
import com.smartparking.app.model.Car;
import com.smartparking.app.model.User;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

/**
 * 用户资料 + 车辆数据仓库（异步）。token 由 ApiClient 拦截器自动附带。
 */
public class UserRepository {

    private final ApiService api;

    public UserRepository() {
        this.api = ApiClient.service();
    }

    public void info(ApiCallback<User> cb) {
        enqueue(api.userInfo(), cb);
    }

    public void updateInfo(String nickname, String avatar, ApiCallback<User> cb) {
        Map<String, String> body = new HashMap<>();
        if (nickname != null) body.put("nickname", nickname);
        if (avatar != null) body.put("avatar", avatar);
        enqueue(api.updateUserInfo(body), cb);
    }

    public void changePassword(String oldPwd, String newPwd, ApiCallback<Void> cb) {
        Map<String, String> body = new HashMap<>();
        body.put("oldPassword", oldPwd);
        body.put("newPassword", newPwd);
        enqueue(api.changePassword(body), cb);
    }

    public void vehicles(ApiCallback<List<Car>> cb) {
        enqueue(api.vehicles(), cb);
    }

    public void bindVehicle(String carNo, ApiCallback<Car> cb) {
        Map<String, String> body = new HashMap<>();
        body.put("carNo", carNo);
        enqueue(api.bindVehicle(body), cb);
    }

    public void unbindVehicle(long carId, ApiCallback<Void> cb) {
        enqueue(api.unbindVehicle(carId), cb);
    }

    private <T> void enqueue(Call<ApiResponse<T>> call, ApiCallback<T> cb) {
        call.enqueue(new Callback<ApiResponse<T>>() {
            @Override
            public void onResponse(Call<ApiResponse<T>> c, Response<ApiResponse<T>> response) {
                if (response.isSuccessful() && response.body() != null) {
                    cb.onSuccess(response.body());
                } else {
                    cb.onError("服务器响应异常(" + response.code() + ")");
                }
            }

            @Override
            public void onFailure(Call<ApiResponse<T>> c, Throwable t) {
                if (t instanceof IOException) {
                    cb.onError("无法连接服务器，请确认后端已启动");
                } else {
                    cb.onError("请求失败：" + t.getMessage());
                }
            }
        });
    }
}
