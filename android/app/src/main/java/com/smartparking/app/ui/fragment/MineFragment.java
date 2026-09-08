package com.smartparking.app.ui.fragment;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.smartparking.app.R;
import com.smartparking.app.data.ApiCallback;
import com.smartparking.app.data.UserRepository;
import com.smartparking.app.model.ApiResponse;
import com.smartparking.app.model.User;
import com.smartparking.app.ui.ChangePasswordActivity;
import com.smartparking.app.ui.EditProfileActivity;
import com.smartparking.app.ui.LoginActivity;
import com.smartparking.app.ui.MemberActivity;
import com.smartparking.app.ui.VehicleActivity;
import com.smartparking.app.util.TokenManager;

/** 我的：个人中心（资料展示 + 功能入口）。 */
public class MineFragment extends Fragment {

    private final UserRepository repository = new UserRepository();
    private TextView tvNick;
    private TextView tvPhone;
    private TextView tvMember;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_mine, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        tvNick = view.findViewById(R.id.tv_mine_nick);
        tvPhone = view.findViewById(R.id.tv_mine_phone);
        tvMember = view.findViewById(R.id.tv_mine_member);

        view.findViewById(R.id.row_edit_profile).setOnClickListener(v ->
                startActivity(new Intent(requireContext(), EditProfileActivity.class)));
        view.findViewById(R.id.row_change_pwd).setOnClickListener(v ->
                startActivity(new Intent(requireContext(), ChangePasswordActivity.class)));
        view.findViewById(R.id.row_vehicle).setOnClickListener(v ->
                startActivity(new Intent(requireContext(), VehicleActivity.class)));
        view.findViewById(R.id.row_member).setOnClickListener(v ->
                startActivity(new Intent(requireContext(), MemberActivity.class)));
        view.findViewById(R.id.row_logout).setOnClickListener(v -> logout());
    }

    @Override
    public void onResume() {
        super.onResume();
        refresh();
    }

    private void refresh() {
        String phone = TokenManager.getPhone(requireContext());
        if (phone == null) {
            tvNick.setText("未登录");
            tvPhone.setText("");
            return;
        }
        tvPhone.setText(phone);
        tvNick.setText("加载中…");
        repository.info(new ApiCallback<User>() {
            @Override
            public void onSuccess(ApiResponse<User> response) {
                if (!isAdded()) return;
                if (response.isSuccess() && response.getData() != null) {
                    User u = response.getData();
                    tvNick.setText(u.getNickname());
                    String m = u.getMemberType();
                    tvMember.setText("MONTH".equals(m) ? "月卡会员" : "YEAR".equals(m) ? "年卡会员" : "普通用户");
                } else {
                    tvNick.setText("昵称");
                }
            }

            @Override
            public void onError(String message) {
                if (!isAdded()) return;
                tvNick.setText("昵称");
            }
        });
    }

    private void logout() {
        TokenManager.clear(requireContext());
        Toast.makeText(requireContext(), "已退出登录", Toast.LENGTH_SHORT).show();
        Intent intent = new Intent(requireContext(), LoginActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
    }
}
