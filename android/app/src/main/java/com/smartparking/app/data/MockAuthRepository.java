package com.smartparking.app.data;

import com.smartparking.app.model.ApiResponse;
import com.smartparking.app.model.User;

import java.util.HashMap;
import java.util.Map;

/**
 * 本地模拟实现，内存 Map 当数据库。
 * 规则：手机号唯一、车牌号唯一、非空校验、密码校验。
 */
public class MockAuthRepository implements AuthRepository {

    // 模拟用户表：手机号 -> 用户
    private static final Map<String, User> USERS = new HashMap<>();
    // 模拟车牌占用表：车牌号 -> 手机号
    private static final Map<String, String> CAR_OWNER = new HashMap<>();

    @Override
    public ApiResponse<User> register(String phone, String password, String carNo) {
        if (isEmpty(phone) || isEmpty(password)) {
            return ApiResponse.error(400, "手机号和密码不能为空");
        }
        if (USERS.containsKey(phone)) {
            return ApiResponse.error(409, "该手机号已注册");
        }
        String car = carNo == null ? "" : carNo.trim();
        if (!car.isEmpty() && CAR_OWNER.containsKey(car)) {
            return ApiResponse.error(409, "该车牌号已被绑定");
        }

        User user = new User();
        user.setId(USERS.size() + 1);
        user.setPhone(phone);
        user.setPassword(password);
        user.setNickname("用户" + tail(phone));
        user.setCarNo(car);

        USERS.put(phone, user);
        if (!car.isEmpty()) {
            CAR_OWNER.put(car, phone);
        }
        return ApiResponse.success(user);
    }

    @Override
    public ApiResponse<User> login(String phone, String password) {
        if (isEmpty(phone) || isEmpty(password)) {
            return ApiResponse.error(400, "手机号和密码不能为空");
        }
        User user = USERS.get(phone);
        if (user == null) {
            return ApiResponse.error(404, "用户不存在，请先注册");
        }
        if (!user.getPassword().equals(password)) {
            return ApiResponse.error(401, "密码错误");
        }
        return ApiResponse.success(user);
    }

    private static boolean isEmpty(String s) {
        return s == null || s.trim().isEmpty();
    }

    private static String tail(String s) {
        return s.length() >= 4 ? s.substring(s.length() - 4) : s;
    }
}
