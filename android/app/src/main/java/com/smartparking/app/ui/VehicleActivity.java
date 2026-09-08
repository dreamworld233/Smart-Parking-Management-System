package com.smartparking.app.ui;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.textfield.TextInputEditText;
import com.smartparking.app.R;
import com.smartparking.app.data.ApiCallback;
import com.smartparking.app.data.UserRepository;
import com.smartparking.app.model.ApiResponse;
import com.smartparking.app.model.Car;

import java.util.List;

/** 车辆管理：绑定 / 解绑车牌。 */
public class VehicleActivity extends BaseActivity {

    private final UserRepository repository = new UserRepository();
    private TextInputEditText etCarNo;
    private LinearLayout llCars;
    private TextView tvEmpty;
    private MaterialButton btnAdd;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_vehicle);

        etCarNo = findViewById(R.id.et_car_no);
        btnAdd = findViewById(R.id.btn_add);
        llCars = findViewById(R.id.ll_cars);
        tvEmpty = findViewById(R.id.tv_empty);

        findViewById(R.id.btn_back).setOnClickListener(v -> finish());
        btnAdd.setOnClickListener(v -> bindCar());
    }

    @Override
    protected void onResume() {
        super.onResume();
        load();
    }

    private void load() {
        repository.vehicles(new ApiCallback<List<Car>>() {
            @Override
            public void onSuccess(ApiResponse<List<Car>> response) {
                if (response.isSuccess() && response.getData() != null) {
                    render(response.getData());
                } else {
                    Toast.makeText(VehicleActivity.this,
                            response.getMessage(), Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onError(String message) {
                Toast.makeText(VehicleActivity.this, message, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void render(List<Car> cars) {
        llCars.removeAllViews();
        tvEmpty.setVisibility(cars.isEmpty() ? View.VISIBLE : View.GONE);
        for (Car car : cars) {
            llCars.addView(buildRow(car));
        }
    }

    private View buildRow(Car car) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, 8, 0, 8);

        TextView tvNo = new TextView(this);
        tvNo.setText(car.getCarNo());
        tvNo.setTextSize(16f);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
        tvNo.setLayoutParams(lp);
        row.addView(tvNo);

        TextView btnUnbind = new TextView(this);
        btnUnbind.setText("解绑");
        btnUnbind.setTextColor(Color.parseColor("#D93025"));
        btnUnbind.setTextSize(14f);
        btnUnbind.setPadding(12, 6, 12, 6);
        btnUnbind.setOnClickListener(v -> unbind(car.getId()));
        row.addView(btnUnbind);

        View divider = new View(this);
        divider.setBackgroundColor(0xFFEEEEEE);
        divider.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 1));
        llCars.addView(divider);
        return row;
    }

    private void bindCar() {
        String no = etCarNo.getText() == null ? "" : etCarNo.getText().toString().trim();
        if (no.isEmpty()) {
            Toast.makeText(this, "请输入车牌号", Toast.LENGTH_SHORT).show();
            return;
        }
        btnAdd.setEnabled(false);
        btnAdd.setText("绑定中…");
        repository.bindVehicle(no, new ApiCallback<Car>() {
            @Override
            public void onSuccess(ApiResponse<Car> response) {
                btnAdd.setEnabled(true);
                btnAdd.setText("绑定");
                if (response.isSuccess()) {
                    Toast.makeText(VehicleActivity.this, "绑定成功", Toast.LENGTH_SHORT).show();
                    etCarNo.setText("");
                    load();
                } else {
                    Toast.makeText(VehicleActivity.this,
                            response.getMessage(), Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onError(String message) {
                btnAdd.setEnabled(true);
                btnAdd.setText("绑定");
                Toast.makeText(VehicleActivity.this, message, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void unbind(long carId) {
        repository.unbindVehicle(carId, new ApiCallback<Void>() {
            @Override
            public void onSuccess(ApiResponse<Void> response) {
                if (response.isSuccess()) {
                    Toast.makeText(VehicleActivity.this, "已解绑", Toast.LENGTH_SHORT).show();
                    load();
                } else {
                    Toast.makeText(VehicleActivity.this,
                            response.getMessage(), Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onError(String message) {
                Toast.makeText(VehicleActivity.this, message, Toast.LENGTH_SHORT).show();
            }
        });
    }
}
