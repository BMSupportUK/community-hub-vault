package uk.bmsupport.player;
import java.lang.reflect.Method;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class)
public class LiveSearchCategoryTest {
    @Test public void searchPreservesProviderCategory() throws Exception {
        MainActivity activity = Robolectric.buildActivity(MainActivity.class).get();
        Method method = MainActivity.class.getDeclaredMethod("itemFrom", String.class, JSONObject.class, String.class, int.class);
        method.setAccessible(true);
        JSONObject row = new JSONObject().put("stream_id", "123").put("name", "NZ | Sky Sport 1").put("category_id", "88");
        MainActivity.Item item = (MainActivity.Item) method.invoke(activity, "live", row, null, 0);
        assertEquals("88", item.category);
        assertEquals("123", item.id);
        MainActivity.Item named = (MainActivity.Item) method.invoke(activity, "live", row, "NZ Sports", 0);
        assertEquals("NZ Sports", named.category);
    }
}