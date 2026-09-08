package com.smartparking.app.data;

import com.smartparking.app.model.ApiResponse;

/**
 * 通用网络回调（UI 线程）。业务失败也走 onSuccess，看 response.isSuccess()。
 */
public interface ApiCallback<T> {

    /** 请求已返回。 */
    void onSuccess(ApiResponse<T> response);

    /** 网络不通 / 超时 / 响应异常。 */
    void onError(String message);
}
