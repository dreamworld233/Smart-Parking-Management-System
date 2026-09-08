package com.smartparking.app.ui;

import android.os.Bundle;
import android.widget.Toast;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.textfield.TextInputEditText;
import com.smartparking.app.R;
import com.smartparking.app.data.ApiCallback;
import com.smartparking.app.data.UserRepository;
import com.smartparking.app.model.ApiResponse;

/** 修改密码。 */
public class ChangePasswordActivity extends BaseActivity {

    private final UserRepository repository = new UserRepository();
    private TextInputEditText etOld;
    private TextInputEditText etNew;
    private TextInputEditText etConfirm;
    private MaterialButton btnSave;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_change_password);

        etOld = findViewById(R.id.et_old);
        etNew = findViewById(R.id.et_new);
        etConfirm = findViewById(R.id.et_confirm);
        btnSave = findViewById(R.id.btn_save);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());
        btnSave.setOnClickListener(v -> save());
    }

    private void save() {
        String oldPwd = text(etOld);
        String newPwd = text(etNew);
        String confirm = text(etConfirm);
        if (oldPwd.isEmpty() || newPwd.isEmpty()) {
            Toast.makeText(this, "密码不能为空", Toast.LENGTH_SHORT).show();
            return;
        }
        if (!newPwd.equals(confirm)) {
            Toast.makeText(this, "两次新密码不一致", Toast.LENGTH_SHORT).show();
            return;
        }
        btnSave.setEnabled(false);
        btnSave.setText("提交中…");
        repository.changePassword(oldPwd, newPwd, new ApiCallback<Void>() {
            @Override
            public void onSuccess(ApiResponse<Void> response) {
                btnSave.setEnabled(true);
                btnSave.setText("确认修改");
                if (response.isSuccess()) {
                    Toast.makeText(ChangePasswordActivity.this, "密码修改成功，请重新登录", Toast.LENGTH_SHORT).show();
                    finish();
                } else {
                    Toast.makeText(ChangePasswordActivity.this,
                            response.getMessage(), Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onError(String message) {
                btnSave.setEnabled(true);
                btnSave.setText("确认修改");
                Toast.makeText(ChangePasswordActivity.this, message, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private static String text(TextInputEditText et) {
        return et.getText() == null ? "" : et.getText().toString();
    }
}
