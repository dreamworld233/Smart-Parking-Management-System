package com.smartparking.app.ui;

import android.content.Intent;
import android.os.Bundle;
import android.widget.TextView;
import android.widget.Toast;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.textfield.TextInputEditText;
import com.smartparking.app.R;
import com.smartparking.app.data.AuthRepository;
import com.smartparking.app.data.MockAuthRepository;
import com.smartparking.app.model.ApiResponse;
import com.smartparking.app.model.User;
import com.smartparking.app.util.TokenManager;

public class LoginActivity extends BaseActivity {

    private TextInputEditText etPhone;
    private TextInputEditText etPassword;
    private AuthRepository repository;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_login);

        repository = new MockAuthRepository();

        etPhone = findViewById(R.id.et_phone);
        etPassword = findViewById(R.id.et_password);
        MaterialButton btnLogin = findViewById(R.id.btn_login);
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

        ApiResponse<User> resp = repository.login(phone, password);
        if (resp.isSuccess()) {
            // mock：token 用手机号拼一个占位，接后端后换成真实 JWT
            TokenManager.save(this, "mock-token-" + phone, phone);
            Toast.makeText(this, "登录成功", Toast.LENGTH_SHORT).show();
            startActivity(new Intent(this, HomeActivity.class));
            finish();
        } else {
            Toast.makeText(this, resp.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }
}
