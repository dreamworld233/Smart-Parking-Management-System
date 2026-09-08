package com.smartparking.app.ui;

import android.content.Intent;
import android.os.Bundle;
import android.widget.TextView;
import android.widget.Toast;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.textfield.TextInputEditText;
import com.smartparking.app.R;
import com.smartparking.app.data.AuthRepository;
import com.smartparking.app.data.RetrofitAuthRepository;
import com.smartparking.app.model.ApiResponse;
import com.smartparking.app.model.AuthResponse;
import com.smartparking.app.util.TokenManager;

public class LoginActivity extends BaseActivity {

    private TextInputEditText etPhone;
    private TextInputEditText etPassword;
    private MaterialButton btnLogin;
    private AuthRepository repository;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_login);

        repository = new RetrofitAuthRepository();

        etPhone = findViewById(R.id.et_phone);
        etPassword = findViewById(R.id.et_password);
        btnLogin = findViewById(R.id.btn_login);
        TextView tvGoRegister = findViewById(R.id.tv_go_register);

        btnLogin.setOnClickListener(v -> doLogin());
        tvGoRegister.setOnClickListener(v ->
                startActivity(new Intent(this, RegisterActivity.class)));
    }

    private void doLogin() {
        String phone = etPhone.getText().toString().trim();
        String password = etPassword.getText().toString();

        if (phone.isEmpty() || password.isEmpty()) {
            Toast.makeText(this, "手机号和密码不能为空", Toast.LENGTH_SHORT).show();
            return;
        }
        if (!phone.matches("\\d{11}")) {
            Toast.makeText(this, "手机号需为 11 位数字", Toast.LENGTH_SHORT).show();
            return;
        }

        setLoading(true);
        repository.login(phone, password, new AuthRepository.AuthCallback() {
            @Override
            public void onSuccess(ApiResponse<AuthResponse> response) {
                setLoading(false);
                if (response.isSuccess()) {
                    // 存后端签发的真实 JWT
                    TokenManager.save(LoginActivity.this,
                            response.getData().getToken(), phone);
                    Toast.makeText(LoginActivity.this, "登录成功", Toast.LENGTH_SHORT).show();
                    startActivity(new Intent(LoginActivity.this, HomeActivity.class));
                    finish();
                } else {
                    Toast.makeText(LoginActivity.this,
                            response.getMessage(), Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onError(String message) {
                setLoading(false);
                Toast.makeText(LoginActivity.this, message, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void setLoading(boolean loading) {
        btnLogin.setEnabled(!loading);
        btnLogin.setText(loading ? "登录中…" : "登录");
    }
}
