package com.smartparking.app.ui;

import android.content.Intent;
import android.os.Bundle;
import android.widget.TextView;

import com.google.android.material.button.MaterialButton;
import com.smartparking.app.R;
import com.smartparking.app.util.TokenManager;

public class HomeActivity extends BaseActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_home);

        TextView tvWelcome = findViewById(R.id.tv_welcome);
        MaterialButton btnLogout = findViewById(R.id.btn_logout);

        String phone = TokenManager.getPhone(this);
        tvWelcome.setText("欢迎，" + (phone == null ? "" : phone));

        btnLogout.setOnClickListener(v -> {
            TokenManager.clear(this);
            startActivity(new Intent(this, LoginActivity.class));
            finish();
        });
    }
}
