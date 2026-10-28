package uk.bmsupport.remote;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;
import org.json.JSONObject;

/** Talks to the website's TV endpoint. Every session call proves itself with the device token. */
public final class Api {
    public static final Api INSTANCE = new Api();
    private final OkHttpClient http = new OkHttpClient();

    private Api() {}

    public OkHttpClient http() {
        return http;
    }

    public JSONObject post(JSONObject body) throws Exception {
        RequestBody rb = RequestBody.create(body.toString(), MediaType.get("application/json"));
        Response res = http.newCall(new Request.Builder().url(BuildConfig.API_URL).post(rb).build()).execute();
        try {
            ResponseBody b = res.body();
            String text = b == null ? "{}" : b.string();
            return new JSONObject(text);
        } finally {
            res.close();
        }
    }

    public interface Extra {
        void put(JSONObject body) throws Exception;
    }

    public JSONObject session(String action, Session s) throws Exception {
        return session(action, s, null);
    }

    public JSONObject session(String action, Session s, Extra extra) throws Exception {
        JSONObject body = new JSONObject()
                .put("action", action)
                .put("session_id", s.id)
                .put("device_token", s.token);
        if (extra != null) extra.put(body);
        return post(body);
    }
}
