package com.smartparking.app.model;

/**
 * 统一返回结构，与后端约定一致。
 * code = 200 成功；其余为错误码。
 * 接真实后端后，Retrofit 直接反序列化成这个类，无需改动调用方。
 */
public class ApiResponse<T> {

    public static final int CODE_OK = 200;

    private int code;
    private String message;
    private T data;

    public ApiResponse() {
    }

    public ApiResponse(int code, String message, T data) {
        this.code = code;
        this.message = message;
        this.data = data;
    }

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(CODE_OK, "成功", data);
    }

    public static <T> ApiResponse<T> error(int code, String message) {
        return new ApiResponse<>(code, message, null);
    }

    public boolean isSuccess() {
        return code == CODE_OK;
    }

    public int getCode() {
        return code;
    }

    public void setCode(int code) {
        this.code = code;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public T getData() {
        return data;
    }

    public void setData(T data) {
        this.data = data;
    }
}
