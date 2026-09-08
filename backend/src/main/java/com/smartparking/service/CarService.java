package com.smartparking.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.smartparking.common.Result;
import com.smartparking.entity.Car;
import com.smartparking.entity.User;
import com.smartparking.mapper.CarMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 车辆业务：用户 1:N 绑定车牌，车牌全局唯一。
 */
@Service
public class CarService {

    private final CarMapper carMapper;
    private final UserService userService;

    public CarService(CarMapper carMapper, UserService userService) {
        this.carMapper = carMapper;
        this.userService = userService;
    }

    /** 当前用户车辆列表。 */
    public Result<List<Car>> listByPhone(String phone) {
        User user = userService.findByPhone(phone);
        if (user == null) {
            return Result.error(404, "用户不存在");
        }
        List<Car> cars = carMapper.selectList(
                new LambdaQueryWrapper<Car>().eq(Car::getUserId, user.getId()));
        return Result.success(cars);
    }

    /** 绑定车辆（车牌唯一）。 */
    public Result<Car> bind(String phone, String carNo) {
        if (carNo == null || carNo.trim().isEmpty()) {
            return Result.error(400, "车牌号不能为空");
        }
        String no = normalize(carNo);
        User user = userService.findByPhone(phone);
        if (user == null) {
            return Result.error(404, "用户不存在");
        }
        Long count = carMapper.selectCount(
                new LambdaQueryWrapper<Car>().eq(Car::getCarNo, no));
        if (count != null && count > 0) {
            return Result.error(409, "该车牌已被绑定");
        }
        Car car = new Car();
        car.setUserId(user.getId());
        car.setCarNo(no);
        car.setCreateTime(LocalDateTime.now());
        carMapper.insert(car);
        return Result.success(car);
    }

    /** 解绑车辆（仅本人可解）。 */
    public Result<Void> unbind(String phone, Long carId) {
        User user = userService.findByPhone(phone);
        if (user == null) {
            return Result.error(404, "用户不存在");
        }
        Car car = carMapper.selectById(carId);
        if (car == null) {
            return Result.error(404, "车辆不存在");
        }
        if (!car.getUserId().equals(user.getId())) {
            return Result.error(403, "无权解绑他人车辆");
        }
        carMapper.deleteById(carId);
        return Result.success();
    }

    private static String normalize(String s) {
        return s.trim().toUpperCase();
    }
}
