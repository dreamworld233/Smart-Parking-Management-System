package com.smartparking.controller;

import com.smartparking.common.Result;
import com.smartparking.config.JwtAuthInterceptor;
import com.smartparking.dto.CarRequest;
import com.smartparking.entity.Car;
import com.smartparking.service.CarService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 车辆管理接口（需登录）。
 */
@RestController
@RequestMapping("/api/user/vehicles")
public class CarController {

    private final CarService carService;

    public CarController(CarService carService) {
        this.carService = carService;
    }

    @GetMapping
    public Result<List<Car>> list(@RequestAttribute(JwtAuthInterceptor.ATTR_PHONE) String phone) {
        return carService.listByPhone(phone);
    }

    @PostMapping
    public Result<Car> bind(@RequestAttribute(JwtAuthInterceptor.ATTR_PHONE) String phone,
                            @Valid @RequestBody CarRequest request) {
        return carService.bind(phone, request.getCarNo());
    }

    @DeleteMapping("/{id}")
    public Result<Void> unbind(@RequestAttribute(JwtAuthInterceptor.ATTR_PHONE) String phone,
                               @PathVariable Long id) {
        return carService.unbind(phone, id);
    }
}
