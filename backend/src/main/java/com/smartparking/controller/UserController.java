package com.smartparking.controller;

import com.smartparking.common.Result;
import com.smartparking.config.JwtAuthInterceptor;
import com.smartparking.dto.ChangePasswordRequest;
import com.smartparking.dto.UpdateProfileRequest;
import com.smartparking.entity.User;
import com.smartparking.service.UserService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 用户资料接口（需登录）。
 */
@RestController
@RequestMapping("/api/user")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/info")
    public Result<User> info(@RequestAttribute(JwtAuthInterceptor.ATTR_PHONE) String phone) {
        return userService.getProfile(phone);
    }

    @PutMapping("/info")
    public Result<User> updateInfo(@RequestAttribute(JwtAuthInterceptor.ATTR_PHONE) String phone,
                                   @RequestBody UpdateProfileRequest request) {
        return userService.updateProfile(phone, request.getNickname(), request.getAvatar());
    }

    @PutMapping("/password")
    public Result<Void> changePassword(@RequestAttribute(JwtAuthInterceptor.ATTR_PHONE) String phone,
                                       @RequestBody ChangePasswordRequest request) {
        return userService.changePassword(phone, request.getOldPassword(), request.getNewPassword());
    }
}
