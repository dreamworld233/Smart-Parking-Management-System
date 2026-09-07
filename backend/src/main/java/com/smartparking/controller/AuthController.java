package com.smartparking.controller;

import com.smartparking.common.Result;
import com.smartparking.dto.CodeLoginRequest;
import com.smartparking.dto.LoginRequest;
import com.smartparking.dto.RegisterRequest;
import com.smartparking.dto.SendCodeRequest;
import com.smartparking.entity.User;
import com.smartparking.service.UserService;
import com.smartparking.service.VerificationCodeService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 认证接口。
 * send-code 发验证码、register 注册、login 密码登录、login-code 验证码登录。
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;
    private final VerificationCodeService codeService;

    public AuthController(UserService userService, VerificationCodeService codeService) {
        this.userService = userService;
        this.codeService = codeService;
    }

    @PostMapping("/send-code")
    public Result<Void> sendCode(@Valid @RequestBody SendCodeRequest request) {
        String error = codeService.send(request.getPhone());
        if (error != null) {
            return Result.error(400, error);
        }
        return Result.success();
    }

    @PostMapping("/register")
    public Result<User> register(@Valid @RequestBody RegisterRequest request) {
        return userService.register(request.getPhone(), request.getPassword(), request.getCarNo());
    }

    @PostMapping("/login")
    public Result<User> login(@Valid @RequestBody LoginRequest request) {
        return userService.login(request.getPhone(), request.getPassword());
    }

    @PostMapping("/login-code")
    public Result<User> loginByCode(@Valid @RequestBody CodeLoginRequest request) {
        return userService.loginByCode(request.getPhone(), request.getCode());
    }
}
