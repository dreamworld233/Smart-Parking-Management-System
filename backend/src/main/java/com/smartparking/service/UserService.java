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
        User user = findByPhone(phone);
        if (user == null) {
            return Result.error(404, "用户不存在，请先注册");
        }
        user.setPassword(null);
        return Result.success(user);
    }

    /** 按手机号查用户（含密码），供内部使用。 */
    public User findByPhone(String phone) {
        return userMapper.selectOne(
                new LambdaQueryWrapper<User>().eq(User::getPhone, phone));
    }

    /** 查当前用户资料（抹密码）。 */
    public Result<User> getProfile(String phone) {
        User user = findByPhone(phone);
        if (user == null) {
            return Result.error(404, "用户不存在");
        }
        user.setPassword(null);
        return Result.success(user);
    }

    /** 修改昵称 / 头像。 */
    public Result<User> updateProfile(String phone, String nickname, String avatar) {
        User user = findByPhone(phone);
        if (user == null) {
            return Result.error(404, "用户不存在");
        }
        if (nickname != null) {
            if (nickname.trim().isEmpty()) {
                return Result.error(400, "昵称不能为空");
            }
            user.setNickname(nickname.trim());
        }
        if (avatar != null) {
            user.setAvatar(avatar.trim().isEmpty() ? null : avatar.trim());
        }
        user.setUpdateTime(LocalDateTime.now());
        userMapper.updateById(user);
        user.setPassword(null);
        return Result.success(user);
    }

    /** 修改密码：验旧密码正确后再存新密码。 */
    public Result<Void> changePassword(String phone, String oldPassword, String newPassword) {
        if (oldPassword == null || oldPassword.isEmpty()
                || newPassword == null || newPassword.isEmpty()) {
            return Result.error(400, "密码不能为空");
        }
        User user = findByPhone(phone);
        if (user == null) {
            return Result.error(404, "用户不存在");
        }
        if (!passwordEncoder.matches(oldPassword, user.getPassword())) {
            return Result.error(401, "原密码错误");
        }
        user.setPassword(passwordEncoder.encode(newPassword));
        user.setUpdateTime(LocalDateTime.now());
        userMapper.updateById(user);
        return Result.success();
    }

    private static String emptyToNull(String s) {
        return s == null || s.trim().isEmpty() ? null : s.trim();
    }

    private static String tail(String s) {
        return s.length() >= 4 ? s.substring(s.length() - 4) : s;
    }
}
