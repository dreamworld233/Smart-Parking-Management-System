package com.smartparking.app.ui;

import android.os.Bundle;
import android.view.MenuItem;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;

import com.google.android.material.bottomnavigation.BottomNavigationView;
import com.smartparking.app.R;
import com.smartparking.app.ui.fragment.HomeFragment;
import com.smartparking.app.ui.fragment.MineFragment;
import com.smartparking.app.ui.fragment.RecordFragment;
import com.smartparking.app.ui.fragment.SpaceFragment;

import java.util.HashMap;
import java.util.Map;

/**
 * 主框架：Fragment 底部导航（首页/车位/记录/我的）。
 * Fragment 用 add/show/hide 保持各 tab 状态，切换不重建。
 */
public class HomeActivity extends BaseActivity {

    private static final String TAG_HOME = "home";
    private static final String TAG_SPACE = "space";
    private static final String TAG_RECORD = "record";
    private static final String TAG_MINE = "mine";

    private final Map<String, Fragment> fragments = new HashMap<>();
    private String currentTag = TAG_HOME;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_home);

        BottomNavigationView nav = findViewById(R.id.bottom_nav);
        nav.setOnItemSelectedListener(this::switchTo);

        if (savedInstanceState == null) {
            showFragment(TAG_HOME);
        } else {
            // 进程重建：优先显示上次 tab
            currentTag = savedInstanceState.getString("currentTag", TAG_HOME);
            showFragment(currentTag);
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString("currentTag", currentTag);
    }

    private boolean switchTo(MenuItem item) {
        int id = item.getItemId();
        String tag;
        if (id == R.id.nav_space) {
            tag = TAG_SPACE;
        } else if (id == R.id.nav_record) {
            tag = TAG_RECORD;
        } else if (id == R.id.nav_mine) {
            tag = TAG_MINE;
        } else {
            tag = TAG_HOME;
        }
        showFragment(tag);
        return true;
    }

    private void showFragment(String tag) {
        currentTag = tag;
        Fragment target = fragments.get(tag);
        if (target == null) {
            target = create(tag);
            fragments.put(tag, target);
        }
        androidx.fragment.app.FragmentTransaction ft =
                getSupportFragmentManager().beginTransaction();
        for (Map.Entry<String, Fragment> e : fragments.entrySet()) {
            if (!e.getKey().equals(tag)) {
                ft.hide(e.getValue());
            }
        }
        if (target.isAdded()) {
            ft.show(target);
        } else {
            ft.add(R.id.fragment_container, target, tag);
        }
        ft.commit();
    }

    private Fragment create(String tag) {
        switch (tag) {
            case TAG_SPACE:
                return new SpaceFragment();
            case TAG_RECORD:
                return new RecordFragment();
            case TAG_MINE:
                return new MineFragment();
            default:
                return new HomeFragment();
        }
    }
}
