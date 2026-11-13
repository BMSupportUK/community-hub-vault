package uk.bmsupport.player;

import android.view.KeyEvent;
import android.widget.GridView;

/** Preserve normal horizontal poster navigation; Left at any row's edge opens categories. */
final class MediaCategoryNavigation {
    static void bind(GridView grid, Runnable open) {
        grid.setOnKeyListener((view, key, event) -> handle(grid, key, event, open));
    }

    static boolean handle(GridView grid, int key, KeyEvent event, Runnable open) {
            if (key != KeyEvent.KEYCODE_DPAD_LEFT) return false;
            int columns = grid.getNumColumns();
            int position = grid.getSelectedItemPosition();
            if (columns < 1 || position < 0 || position % columns != 0) return false;
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) open.run();
            return true;
    }
}