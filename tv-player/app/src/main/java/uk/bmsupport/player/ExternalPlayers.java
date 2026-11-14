package uk.bmsupport.player;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Opt-in installed video handlers; BM Player is never replaced as the default. */
final class ExternalPlayers {
    static final String KEY = "external_players";
    static Intent intent(String component, String url, String title, long position) {
        ComponentName target = ComponentName.unflattenFromString(component);
        if (target == null) throw new IllegalArgumentException("Invalid player");
        return new Intent(Intent.ACTION_VIEW).setComponent(target)
                .setDataAndType(Uri.parse(url), "video/*")
                .putExtra("title", title).putExtra("position", position)
                .putExtra("from_start", position <= 0);
    }
    static List<ResolveInfo> installed(Context ctx) {
        Intent query = new Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse("https://example.invalid/video.mp4"), "video/*");
        List<ResolveInfo> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (ResolveInfo r : ctx.getPackageManager().queryIntentActivities(query, 0)) {
            if (!r.activityInfo.exported || ctx.getPackageName().equals(r.activityInfo.packageName)) continue;
            if (seen.add(id(r))) out.add(r);
        }
        out.sort((a,b) -> a.loadLabel(ctx.getPackageManager()).toString().compareToIgnoreCase(b.loadLabel(ctx.getPackageManager()).toString()));
        return out;
    }
    static String id(ResolveInfo r) { return new ComponentName(r.activityInfo.packageName, r.activityInfo.name).flattenToString(); }
    static List<ResolveInfo> enabled(Context ctx, SharedPreferences prefs) {
        Set<String> saved = prefs.getStringSet(KEY, java.util.Collections.emptySet());
        List<ResolveInfo> out = installed(ctx);
        out.removeIf(r -> !saved.contains(id(r)));
        return out;
    }
}