package com.smartparking.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.smartparking.entity.User;

/**
 * 用户 Mapper。继承 BaseMapper 后自带常用 CRUD，
 * 复杂查询再手动写 SQL / 条件构造器。
 */
public interface UserMapper extends BaseMapper<User> {
}
