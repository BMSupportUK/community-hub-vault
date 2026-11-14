package uk.bmsupport.player;

import android.app.AlertDialog;
import android.content.Context;
import android.widget.ArrayAdapter;
import android.widget.ListView;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

/** Row actions capture the category itself, never the focus lost when entering a toolbar. */
final class CategoryEditor {
    static ListView create(Context context, List<String[]> rows, Set<String> hidden) {
        ListView list = new ListView(context);
        Runnable[] redraw = new Runnable[1];
        redraw[0] = () -> {
            List<String> names = new ArrayList<>();
            for (String[] row : rows) names.add((hidden.contains(row[0]) ? "○ Hidden · " : "● ") + row[1]);
            list.setAdapter(new ArrayAdapter<>(context, android.R.layout.simple_list_item_1, names));
        };
        list.setOnItemClickListener((parent, view, position, id) -> {
            String[] picked = rows.get(position);
            new AlertDialog.Builder(context).setTitle(picked[1])
                .setItems(new String[]{"Move up", "Move down", hidden.contains(picked[0]) ? "Show category" : "Hide category"}, (d, action) -> {
                    int index = rows.indexOf(picked);
                    if (index < 0) return;
                    if (action == 2) { if (!hidden.remove(picked[0])) hidden.add(picked[0]); }
                    else {
                        int target = index + (action == 0 ? -1 : 1);
                        if (target >= 0 && target < rows.size()) Collections.swap(rows, index, target);
                    }
                    redraw[0].run();
                    list.requestFocus(); list.setSelection(rows.indexOf(picked));
                }).setNegativeButton("Cancel", null).show();
        });
        redraw[0].run();
        return list;
    }
}