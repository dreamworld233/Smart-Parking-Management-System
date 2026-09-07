package com.smartparking.common;

/**
 * 统一返回结构：code / message / data。
 * 与移动端 ApiResponse 字段对齐，方便前后端对接。
 */
public class Result<T> {

    public static final int CODE_OK = 200;

    private int code;
    private String message;
    private T data;

    public Result() {
    }

    public Result(int code, String message, T data) {
        this.code = code;
        this.message = message;
        this.data = data;
    }

    public static <T> Result<T> success(T data) {
        return new Result<>(CODE_OK, "成功", data);
    }

    public static <T> Result<T> success() {
        return new Result<>(CODE_OK, "成功", null);
    }

    public static <T> Result<T> error(int code, String message) {
        return new Result<>(code, message, null);
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
