package com.smartparking.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.smartparking.common.Result;
import com.smartparking.dto.AuthResponse;
import com.smartparking.entity.User;
import com.smartparking.mapper.UserMapper;
import com.smartparking.util.JwtUtil;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 用户业务：注册 / 密码登录 / 验证码登录。
 * 手机号唯一凭证，密码 BCrypt 加密存储。注册/登录成功后签发 JWT。
 */
@Service
public class UserService {

    private final UserMapper userMapper;
    private final VerificationCodeService codeService;
    private final JwtUtil jwtUtil;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public UserService(UserMapper userMapper, VerificationCodeService codeService, JwtUtil jwtUtil) {
        this.userMapper = userMapper;
        this.codeService = codeService;
        this.jwtUtil = jwtUtil;
    }

    public Result<AuthResponse> register(String phone, String password, String carNo) {
        Long count = userMapper.selectCount(
                new LambdaQueryWrapper<User>().eq(User::getPhone, phone));
        if (count != null && count > 0) {
            return Result.error(409, "该手机号已注册");
        }

        User user = new User();
        user.setPhone(phone);
        user.setPassword(passwordEncoder.encode(password));
        user.setNickname("用户" + tail(phone));
        user.setCarNo(emptyToNull(carNo));
        LocalDateTime now = LocalDateTime.now();
        user.setCreateTime(now);
        user.setUpdateTime(now);

        userMapper.insert(user);
        user.setPassword(null); // 返回前抹掉密码
        return Result.success(new AuthResponse(jwtUtil.generateToken(phone), user));
    }

    public Result<AuthResponse> login(String phone, String password) {
        User user = userMapper.selectOne(
                new LambdaQueryWrapper<User>().eq(User::getPhone, phone));
        if (user == null) {
            return Result.error(404, "用户不存在，请先注册");
        }
        if (!passwordEncoder.matches(password, user.getPassword())) {
            return Result.error(401, "密码错误");
        }
        user.setPassword(null);
        return Result.success(new AuthResponse(jwtUtil.generateToken(phone), user));
    }

    public Result<User> loginByCode(String phone, String code) {
        if (!codeService.verify(phone, code)) {
            return Result.error(400, "验证码错误或已过期");
        }
        User user = userMapper.selectOne(
                new LambdaQueryWrapper<User>().eq(User::getPhone, phone));
        if (user == null) {
            return Result.error(404, "用户不存在，请先注册");
        }
        user.setPassword(null);
        return Result.success(user);
    }

    private static String emptyToNull(String s) {
        return s == null || s.trim().isEmpty() ? null : s.trim();
    }

    private static String tail(String s) {
        return s.length() >= 4 ? s.substring(s.length() - 4) : s;
    }
}
