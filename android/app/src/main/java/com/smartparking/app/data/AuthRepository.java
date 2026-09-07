package com.smartparking.app.data;

import com.smartparking.app.model.ApiResponse;
import com.smartparking.app.model.User;

/**
 * 登录/注册抽象。
 * 现在用 MockAuthRepository（本地模拟），
 * 后端就绪后新增 RetrofitAuthRepository 实现本接口即可，调用方不用改。
 */
public interface AuthRepository {

    ApiResponse<User> register(String phone, String password, String carNo);

    ApiResponse<User> login(String phone, String password);
}
