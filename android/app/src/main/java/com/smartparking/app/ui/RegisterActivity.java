package com.smartparking.app.ui;

import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.textfield.TextInputEditText;
import com.smartparking.app.R;
import com.smartparking.app.data.AuthRepository;
import com.smartparking.app.data.RetrofitAuthRepository;
import com.smartparking.app.model.ApiResponse;
import com.smartparking.app.model.AuthResponse;
import com.smartparking.app.util.TokenManager;

public class RegisterActivity extends BaseActivity {

    private TextInputEditText etPhone;
    private TextInputEditText etPassword;
    private TextInputEditText etConfirm;
    private TextInputEditText etCarNo;
    private MaterialButton btnRegister;
    private AuthRepository repository;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_register);

        repository = new RetrofitAuthRepository();

        etPhone = findViewById(R.id.et_phone);
        etPassword = findViewById(R.id.et_password);
        etConfirm = findViewById(R.id.et_confirm);
        etCarNo = findViewById(R.id.et_car_no);
        btnRegister = findViewById(R.id.btn_register);

        btnRegister.setOnClickListener(v -> doRegister());
        // 返回登录：finish 回到 LoginActivity（从登录页跳来）
        findViewById(R.id.btn_back).setOnClickListener(v -> finish());
    }

    private void doRegister() {
        String phone = etPhone.getText().toString().trim();
        String password = etPassword.getText().toString();
        String confirm = etConfirm.getText().toString();
        String carNo = etCarNo.getText().toString().trim();

        if (phone.isEmpty() || password.isEmpty()) {
            Toast.makeText(this, "手机号和密码不能为空", Toast.LENGTH_SHORT).show();
            return;
        }
        if (!phone.matches("\\d{11}")) {
            Toast.makeText(this, "手机号需为 11 位数字", Toast.LENGTH_SHORT).show();
            return;
        }
        if (!password.equals(confirm)) {
            Toast.makeText(this, "两次密码不一致", Toast.LENGTH_SHORT).show();
            return;
        }

        setLoading(true);
        repository.register(phone, password, carNo, new AuthRepository.AuthCallback() {
            @Override
            public void onSuccess(ApiResponse<AuthResponse> response) {
                setLoading(false);
                if (response.isSuccess()) {
                    // 注册成功自动登录，存后端签发的 JWT
                    TokenManager.save(RegisterActivity.this,
                            response.getData().getToken(), phone);
                    Toast.makeText(RegisterActivity.this, "注册成功", Toast.LENGTH_SHORT).show();
                    Intent intent = new Intent(RegisterActivity.this, HomeActivity.class);
                    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                    startActivity(intent);
                    finish();
                } else {
                    Toast.makeText(RegisterActivity.this,
                            response.getMessage(), Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onError(String message) {
                setLoading(false);
                Toast.makeText(RegisterActivity.this, message, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void setLoading(boolean loading) {
        btnRegister.setEnabled(!loading);
        btnRegister.setText(loading ? "注册中…" : "注册");
    }
}
