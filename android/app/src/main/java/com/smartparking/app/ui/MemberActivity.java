package com.smartparking.app.ui;

import android.os.Bundle;

import com.smartparking.app.R;

/** 会员办理占位页（第 3 周换真实开通）。 */
public class MemberActivity extends BaseActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_member);
        findViewById(R.id.btn_back).setOnClickListener(v -> finish());
    }
}
