package com.smartparking.app.ui;

import android.os.Bundle;
import android.widget.Toast;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.textfield.TextInputEditText;
import com.smartparking.app.R;
import com.smartparking.app.data.ApiCallback;
import com.smartparking.app.data.UserRepository;
import com.smartparking.app.model.ApiResponse;
import com.smartparking.app.model.User;

/** 编辑资料：改昵称。 */
public class EditProfileActivity extends BaseActivity {

    private final UserRepository repository = new UserRepository();
    private TextInputEditText etNick;
    private MaterialButton btnSave;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_edit_profile);

        etNick = findViewById(R.id.et_nick);
        btnSave = findViewById(R.id.btn_save);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());

        // 预填当前昵称
        repository.info(new ApiCallback<User>() {
            @Override
            public void onSuccess(ApiResponse<User> response) {
                if (response.isSuccess() && response.getData() != null) {
                    etNick.setText(response.getData().getNickname());
                }
            }

            @Override
            public void onError(String message) {
            }
        });

        btnSave.setOnClickListener(v -> save());
    }

    private void save() {
        String nick = etNick.getText() == null ? "" : etNick.getText().toString().trim();
        if (nick.isEmpty()) {
            Toast.makeText(this, "昵称不能为空", Toast.LENGTH_SHORT).show();
            return;
        }
        btnSave.setEnabled(false);
        btnSave.setText("保存中…");
        repository.updateInfo(nick, null, new ApiCallback<User>() {
            @Override
            public void onSuccess(ApiResponse<User> response) {
                btnSave.setEnabled(true);
                btnSave.setText("保存");
                if (response.isSuccess()) {
                    Toast.makeText(EditProfileActivity.this, "保存成功", Toast.LENGTH_SHORT).show();
                    finish();
                } else {
                    Toast.makeText(EditProfileActivity.this,
                            response.getMessage(), Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onError(String message) {
                btnSave.setEnabled(true);
                btnSave.setText("保存");
                Toast.makeText(EditProfileActivity.this, message, Toast.LENGTH_SHORT).show();
            }
        });
    }
}
