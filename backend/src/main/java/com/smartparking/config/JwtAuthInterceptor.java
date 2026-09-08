package com.smartparking.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartparking.common.Result;
import com.smartparking.util.JwtUtil;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.nio.charset.StandardCharsets;

/**
 * JWT 鉴权拦截器。
 * 从 Authorization: Bearer <token> 取 token，校验签名/过期后把手机号放入 request，
 * 供 Controller 用 @RequestAttribute("phone") 读取。无效统一返回 401。
 */
@Component
public class JwtAuthInterceptor implements HandlerInterceptor {

    public static final String ATTR_PHONE = "phone";

    private final JwtUtil jwtUtil;
    private final ObjectMapper objectMapper;

    public JwtAuthInterceptor(JwtUtil jwtUtil, ObjectMapper objectMapper) {
        this.jwtUtil = jwtUtil;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        String auth = request.getHeader("Authorization");
        if (auth == null || !auth.startsWith("Bearer ")) {
            return reject(response);
        }
        try {
            String phone = jwtUtil.parsePhone(auth.substring(7));
            request.setAttribute(ATTR_PHONE, phone);
            return true;
        } catch (Exception e) {
            // 签名非法 / 过期 / 格式错
            return reject(response);
        }
    }

    private boolean reject(HttpServletResponse response) throws Exception {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(objectMapper.writeValueAsString(Result.error(401, "未登录或登录已过期")));
        return false;
    }
}
