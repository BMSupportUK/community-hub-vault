package uk.bmsupport.player;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.text.TextUtils;
import android.text.TextPaint;
import android.view.KeyEvent;
import android.view.View;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Sky-style grid: channels down the left, time across the top, programmes drawn as boxes sized by length. */
public class GuideGridView extends View {
    public static final class Prog {
        public final String title; public final long st, en;
        public Prog(String t, long s, long e) { title = t; st = s; en = e; }
    }
    public interface Listener {
        void needEpg(int row);
        void onHighlight(int row, Prog p);
        void onPick(int row, Prog p);
        boolean hasReminder(int row, long st);
    }

    private static final long SLOT = 1800, WINDOW = 3600, MARK = 900;
    private final List<String> names = new ArrayList<>();
    private final Map<Integer, List<Prog>> progs = new HashMap<>();
    private Listener listener;
    private int selRow = 0, topRow = 0, lastRow = -1;
    private long windowStart, selTime;
    private Prog lastProg;
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final TextPaint txt = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final float d;

    public GuideGridView(Context c) {
        super(c);
        d = c.getResources().getDisplayMetrics().density;
        setFocusable(true); setFocusableInTouchMode(true);
        resetTime();
    }

    private static long now() { return System.currentTimeMillis() / 1000; }
    private long minStart() { return now() / SLOT * SLOT; }
    private void resetTime() { windowStart = minStart(); selTime = now(); }

    public void setListener(Listener l) { listener = l; }
    public void setChannels(List<String> n) {
        names.clear(); names.addAll(n); progs.clear();
        selRow = 0; topRow = 0; lastRow = -1; lastProg = null; resetTime();
        invalidate(); post(this::changed);
    }
    public void setProgs(int row, List<Prog> l) { progs.put(row, l); invalidate(); if (row == selRow) changed(); }
    public boolean loaded(int row) { return progs.containsKey(row); }
    public int selectedRow() { return selRow; }
    public void jumpNow() { resetTime(); invalidate(); changed(); }
    public void shiftDay(int days) {
        windowStart = Math.max(minStart(), windowStart + days * 86400L);
        selTime = Math.max(now(), windowStart + 60);
        invalidate(); changed();
    }

    private Prog progAt(int row, long t) {
        List<Prog> l = progs.get(row);
        if (l == null) return null;
        for (Prog p : l) if (p.st <= t && t < (p.en > p.st ? p.en : p.st + SLOT)) return p;
        return null;
    }
    public Prog selected() { return progAt(selRow, selTime); }

    private float rowH() { return 64 * d; }
    private float headH() { return 36 * d; }
    private float chW() { return Math.min(220 * d, getWidth() * 0.26f); }
    private int visibleRows() { return Math.max(1, (int) ((getHeight() - headH()) / rowH())); }

    private void changed() {
        if (listener == null || names.isEmpty()) return;
        int v = visibleRows();
        for (int r = Math.max(0, topRow - 3); r < Math.min(names.size(), topRow + v + 10); r++) listener.needEpg(r);
        Prog p = selected();
        if (selRow != lastRow || p != lastProg) { lastRow = selRow; lastProg = p; listener.onHighlight(selRow, p); }
    }

    private void moveRow(int dRow) {
        if (names.isEmpty()) return;
        selRow = Math.max(0, Math.min(names.size() - 1, selRow + dRow));
        int v = visibleRows();
        if (selRow < topRow) topRow = selRow;
        if (selRow >= topRow + v) topRow = selRow - v + 1;
        invalidate(); changed();
    }

    private void moveTime(boolean right) {
        Prog p = selected();
        long t;
        if (right) t = p != null && p.en > selTime ? p.en : selTime + SLOT;
        else t = p != null ? p.st - 1 : selTime - SLOT;
        if (t < now()) t = now();
        selTime = t;
        Prog np = selected();
        if (np != null && np.st > selTime - 1) selTime = np.st;
        while (selTime >= windowStart + WINDOW) windowStart += SLOT;
        while (selTime < windowStart && windowStart > minStart()) windowStart -= SLOT;
        invalidate(); changed();
    }

    @Override public boolean onKeyDown(int k, KeyEvent e) {
        switch (k) {
            case KeyEvent.KEYCODE_DPAD_UP: if (selRow == 0) return false; moveRow(-1); return true;
            case KeyEvent.KEYCODE_DPAD_DOWN: moveRow(1); return true;
            case KeyEvent.KEYCODE_PAGE_UP: case KeyEvent.KEYCODE_CHANNEL_UP: moveRow(-visibleRows()); return true;
            case KeyEvent.KEYCODE_PAGE_DOWN: case KeyEvent.KEYCODE_CHANNEL_DOWN: moveRow(visibleRows()); return true;
            case KeyEvent.KEYCODE_DPAD_RIGHT: moveTime(true); return true;
            case KeyEvent.KEYCODE_DPAD_LEFT: moveTime(false); return true;
            case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER: case KeyEvent.KEYCODE_NUMPAD_ENTER:
                if (listener != null && !names.isEmpty()) listener.onPick(selRow, selected()); return true;
        }
        return super.onKeyDown(k, e);
    }

    private String hhmm(long s) {
        java.util.Calendar c = java.util.Calendar.getInstance(); c.setTimeInMillis(s * 1000);
        return String.format(java.util.Locale.UK, "%02d:%02d", c.get(java.util.Calendar.HOUR_OF_DAY), c.get(java.util.Calendar.MINUTE));
    }

    @Override protected void onSizeChanged(int w, int h, int ow, int oh) { super.onSizeChanged(w, h, ow, oh); post(this::changed); }

    @Override protected void onDraw(Canvas c) {
        float W = getWidth(), H = getHeight(), ch = chW(), hh = headH(), rh = rowH();
        float gridW = W - ch, pxPerSec = gridW / WINDOW;
        long nowS = now();
        // header
        fill.setColor(0xFF0F1A30); c.drawRect(0, 0, W, hh, fill);
        txt.setColor(0xFFF1F5F9); txt.setTextSize(15 * d); txt.setFakeBoldText(true);
        java.text.SimpleDateFormat df = new java.text.SimpleDateFormat("EEE d MMM", java.util.Locale.UK);
        c.drawText(df.format(new java.util.Date(windowStart * 1000)), 10 * d, hh * 0.68f, txt);
        txt.setFakeBoldText(false);
        for (long t = windowStart; t < windowStart + WINDOW; t += MARK) {
            float x = ch + (t - windowStart) * pxPerSec;
            c.drawText(hhmm(t), x + 6 * d, hh * 0.68f, txt);
            fill.setColor(0xFF334155); c.drawRect(x, 0, x + 1, H, fill);
        }
        int v = visibleRows() + 1;
        for (int i = 0; i < v && topRow + i < names.size(); i++) {
            int r = topRow + i;
            float y = hh + i * rh;
            boolean selR = r == selRow;
            fill.setColor(selR ? 0xFF1E2C4D : 0xFF16213A);
            c.drawRect(0, y + 1, ch - 2, y + rh - 1, fill);
            txt.setColor(0xFFF1F5F9); txt.setTextSize(15 * d); txt.setFakeBoldText(selR);
            String label = (r + 1) + "  " + names.get(r);
            c.drawText(TextUtils.ellipsize(label, txt, ch - 16 * d, TextUtils.TruncateAt.END).toString(), 8 * d, y + rh / 2 + 5 * d, txt);
            txt.setFakeBoldText(false);
            List<Prog> l = progs.get(r);
            Prog sel = selR ? selected() : null;
            if (l == null || l.isEmpty()) {
                fill.setColor(0xFF111a2e); c.drawRect(ch + 2, y + 2, W - 2, y + rh - 2, fill);
                txt.setColor(0xFF94A3B8); txt.setTextSize(13 * d);
                c.drawText(l == null ? "Loading…" : "No guide information", ch + 10 * d, y + rh / 2 + 5 * d, txt);
                if (selR) drawRing(c, new RectF(ch + 2, y + 2, W - 2, y + rh - 2));
                continue;
            }
            float cursor = ch, minBox = 150 * d;
            c.save(); c.clipRect(ch, y, W, y + rh);
            for (int pi = 0; pi < l.size(); pi++) {
                Prog p = l.get(pi);
                long en = p.en > p.st ? p.en : p.st + SLOT;
                // Never let a box run over the next programme's start (overlapping EPG data).
                if (pi + 1 < l.size() && l.get(pi + 1).st > p.st && l.get(pi + 1).st < en) en = l.get(pi + 1).st;
                if (en <= windowStart || p.st >= windowStart + WINDOW) continue;
                float x1 = ch + Math.max(0, p.st - windowStart) * pxPerSec;
                float x2 = ch + Math.min(WINDOW, en - windowStart) * pxPerSec;
                // Short programmes get a readable minimum width so the name and start time always show;
                // later boxes shift right just enough to make room.
                // True time scale: every box starts exactly under its start time on the header.
                RectF box = new RectF(x1 + 2, y + 2, Math.max(x1 + 4, x2 - 2), y + rh - 2);
                boolean onNow = p.st <= nowS && nowS < en;
                fill.setColor(p == sel ? 0xFFE11D48 : onNow ? 0xFF24345A : 0xFF1A2742);
                c.drawRoundRect(box, 6 * d, 6 * d, fill);
                if (onNow && p != sel) {
                    float px = box.left + (box.width()) * Math.min(1f, (nowS - Math.max(p.st, windowStart)) / (float) Math.max(1, en - Math.max(p.st, windowStart)));
                    fill.setColor(0x33FFFFFF); c.drawRoundRect(new RectF(box.left, box.top, px, box.bottom), 6 * d, 6 * d, fill);
                }
                txt.setColor(0xFFF1F5F9); txt.setTextSize(14 * d); txt.setFakeBoldText(p == sel);
                boolean rem = listener != null && listener.hasReminder(r, p.st);
                String t = (rem ? "⏰ " : "") + p.title;
                float pad = box.width() < 60 * d ? 3 * d : 6 * d;
                float avail = box.width() - 2 * pad;
                c.save(); c.clipRect(box);
                if (avail >= 14 * d) {
                    boolean narrow = box.width() < 90 * d;
                    if (narrow) txt.setTextSize(12 * d);
                    String shown = TextUtils.ellipsize(t, txt, avail, TextUtils.TruncateAt.END).toString();
                    if (shown.length() <= 1 && t.length() > 1) shown = "…";
                    String times = box.width() < 170 * d ? hhmm(p.st) : hhmm(p.st) + " – " + hhmm(en);
                    float tw = txt.measureText(times);
                    txt.setTextSize(11 * d); boolean fitsTimes = txt.measureText(times) <= avail;
                    txt.setTextSize(narrow ? 12 * d : 14 * d);
                    float ty = fitsTimes ? y + rh / 2 : y + rh / 2 + 5 * d;
                    c.drawText(shown, box.left + pad, ty, txt);
                    if (fitsTimes) {
                        txt.setTextSize(11 * d); txt.setFakeBoldText(false); txt.setColor(0xFFCBD5E1);
                        c.drawText(times, box.left + pad, y + rh / 2 + 16 * d, txt);
                    }
                }
                c.restore();
                if (p == sel) drawRing(c, box);
            }
            c.restore();
        }
        // now line
        if (nowS >= windowStart && nowS < windowStart + WINDOW) {
            float x = ch + (nowS - windowStart) * pxPerSec;
            fill.setColor(0xFFEF4444); c.drawRect(x - 1.5f * d, hh, x + 1.5f * d, H, fill);
        }
        if (isFocused()) postInvalidateDelayed(30000);
    }

    private void drawRing(Canvas c, RectF r) {
        if (!isFocused()) return;
        Paint s = new Paint(Paint.ANTI_ALIAS_FLAG); s.setStyle(Paint.Style.STROKE); s.setStrokeWidth(3 * d); s.setColor(0xFFFFFFFF);
        c.drawRoundRect(r, 6 * d, 6 * d, s);
    }

    @Override protected void onFocusChanged(boolean f, int dir, android.graphics.Rect prev) { super.onFocusChanged(f, dir, prev); invalidate(); }
}
