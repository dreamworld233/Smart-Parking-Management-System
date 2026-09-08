package com.smartparking.app.data;

import com.smartparking.app.SPMSApplication;
import com.smartparking.app.util.TokenManager;

import java.io.IOException;

import okhttp3.Interceptor;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import retrofit2.Retrofit;
import retrofit2.converter.gson.GsonConverterFactory;

/**
 * Retrofit 单例。
 * BASE_URL：模拟器里 10.0.2.2 指向宿主机（MuMu / AVD 通用），真机改成电脑局域网 IP。
 * 所有请求自动带 Authorization: Bearer <token>（已登录时）。
 */
public final class ApiClient {

    private static final String BASE_URL = "http://10.0.2.2:8080/";

    private static Retrofit retrofit;

    private ApiClient() {
    }

    private static OkHttpClient okHttp() {
        return new OkHttpClient.Builder()
                .addInterceptor(new Interceptor() {
                    @Override
                    public Response intercept(Chain chain) throws IOException {
                        String token = TokenManager.getToken(SPMSApplication.get());
                        Request request = chain.request();
                        if (token != null) {
                            request = request.newBuilder()
                                    .header("Authorization", "Bearer " + token)
                                    .build();
                        }
                        return chain.proceed(request);
                    }
                })
                .build();
    }

    public static synchronized Retrofit get() {
        if (retrofit == null) {
            retrofit = new Retrofit.Builder()
                    .baseUrl(BASE_URL)
                    .client(okHttp())
                    .addConverterFactory(GsonConverterFactory.create())
                    .build();
        }
        return retrofit;
    }

    public static ApiService service() {
        return get().create(ApiService.class);
    }
}
