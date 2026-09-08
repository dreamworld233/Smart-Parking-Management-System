package com.smartparking.app.data;

import retrofit2.Retrofit;
import retrofit2.converter.gson.GsonConverterFactory;

/**
 * Retrofit 单例。
 * BASE_URL：模拟器里 10.0.2.2 指向宿主机（MuMu / AVD 通用），真机改成电脑局域网 IP。
 */
public final class ApiClient {

    private static final String BASE_URL = "http://10.0.2.2:8080/";

    private static Retrofit retrofit;

    private ApiClient() {
    }

    public static synchronized Retrofit get() {
        if (retrofit == null) {
            retrofit = new Retrofit.Builder()
                    .baseUrl(BASE_URL)
                    .addConverterFactory(GsonConverterFactory.create())
                    .build();
        }
        return retrofit;
    }

    public static ApiService service() {
        return get().create(ApiService.class);
    }
}
