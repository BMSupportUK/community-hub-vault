package uk.bmsupport.player;
import static org.junit.Assert.*;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import android.content.SharedPreferences;

@RunWith(RobolectricTestRunner.class)
public class CategoryOrderTest {
    private List<String[]> rows() { return Arrays.asList(new String[]{"*","All"},new String[]{"1","News"},new String[]{"2","Sport"},new String[]{"3","New"}); }
    @Test public void allStaysFirstAndNewCategoriesAppendInProviderOrder() {
        List<String[]> sorted = CategoryOrder.apply(rows(), "[\"9\",\"2\",\"2\"]");
        assertEquals("*",sorted.get(0)[0]); assertEquals("2",sorted.get(1)[0]);
        assertEquals("1",sorted.get(2)[0]); assertEquals("3",sorted.get(3)[0]);
        assertEquals("1",rows().get(1)[0]);
    }
    @Test public void settingsSavePersistsIndependentlyForLiveMoviesAndSeries() {
        SharedPreferences prefs=RuntimeEnvironment.getApplication().getSharedPreferences("category-test",0);
        prefs.edit().clear().putString("user","one").putString("dns","https://provider.test").commit();
        CategoryOrder.save(prefs,"live",CategoryOrder.apply(rows(),"[\"2\",\"1\"]"));
        CategoryOrder.save(prefs,"film",CategoryOrder.apply(rows(),"[\"3\",\"1\"]"));
        CategoryOrder.save(prefs,"series",CategoryOrder.apply(rows(),"[\"1\",\"3\"]"));
        assertEquals("2",CategoryOrder.apply(rows(),prefs.getString(CategoryOrder.key(prefs,"live"),"[]")).get(1)[0]);
        assertEquals("3",CategoryOrder.apply(rows(),prefs.getString(CategoryOrder.key(prefs,"film"),"[]")).get(1)[0]);
        assertEquals("1",CategoryOrder.apply(rows(),prefs.getString(CategoryOrder.key(prefs,"series"),"[]")).get(1)[0]);
        String key=CategoryOrder.key(prefs,"live");prefs.edit().putString("user","two").commit();
        assertNotEquals(key,CategoryOrder.key(prefs,"live"));
    }
    @Test public void resetAndMalformedPreferencesKeepProviderOrder() {
        assertEquals("1",CategoryOrder.apply(rows(),"[]").get(1)[0]);
        assertEquals("1",CategoryOrder.apply(rows(),"broken").get(1)[0]);
    }
}