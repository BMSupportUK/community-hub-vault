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
        public String desc = "";
        public Prog(String t, long s, long e) { title = t; st = s; en = e; }
    }
    public interface Listener {
        void needEpg(int row);
        void onHighlight(int row, Prog p);
        void onPick(int row, Prog p);
        boolean hasReminder(int row, long st);
        void onCatchup(int row);
    }

    private static final long SLOT = 1800;
    // Phones show a 3-hour window and slimmer rows so more of the guide fits; TVs keep 2 hours.
    private long WINDOW = 7200;
    private boolean phone;
    private final List<String> names = new ArrayList<>();
    private final List<Boolean> catchup = new ArrayList<>();
    private final Map<Integer, List<Prog>> progs = new HashMap<>();
    private Listener listener;
    private int selRow = 0, topRow = 0, lastRow = -1;
    private long windowStart, selTime;
    private Prog lastProg;
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final TextPaint txt = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final float d;
    private int marqueeRow = -1;
    private long marqueeStarted;

    public GuideGridView(Context c) {
        super(c);
        d = c.getResources().getDisplayMetrics().density;
        phone = c.getResources().getConfiguration().smallestScreenWidthDp < 600;
        if (phone) WINDOW = 10800;
        setFocusable(true); setFocusableInTouchMode(true);
        resetTime();
    }

    private static long now() { return System.currentTimeMillis() / 1000; }
    private long minStart() { return now() / SLOT * SLOT; }
    private void resetTime() { windowStart = minStart(); selTime = now(); }

    public void setListener(Listener l) { listener = l; }
    public void setChannels(List<String> n, List<Boolean> cu) {
        names.clear(); names.addAll(n); catchup.clear(); catchup.addAll(cu); progs.clear();
        selRow = 0; topRow = 0; lastRow = -1; lastProg = null; resetTime();
        invalidate(); post(this::changed);
    }
    public void setProgs(int row, List<Prog> l) { progs.put(row, l); invalidate(); if (row == selRow) changed(); }
    public boolean loaded(int row) { return progs.containsKey(row); }
    /** End of the time span currently on screen (moves forward with Day ▶ and sideways swipes). */
    public long windowEnd() { return windowStart + WINDOW; }
    public int selectedRow() { return selRow; }
    public void selectChannel(int row) {
        if (row < 0 || row >= names.size()) return;
        onClock = false;
        resetTime();
        moveRow(row - selRow);
        requestFocus();
    }
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

    private float rowH() { return (phone ? 50 : 64) * d; }
    private float headH() { return 36 * d; }
    private float chW() { return phone ? Math.min(150 * d, getWidth() * 0.22f) : Math.min(220 * d, getWidth() * 0.26f); }
    /** Every minute while on screen: move the "now" line and re-ask for any channel line-up that has gone stale. */
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!isAttachedToWindow()) return;
            long now = System.currentTimeMillis() / 1000;
            if (now >= windowStart + SLOT && windowStart + SLOT <= (now / SLOT) * SLOT) { windowStart = (now / SLOT) * SLOT; if (selTime < now) selTime = now; }
            invalidate(); changed();
            postDelayed(this, 60_000);
        }
    };
    @Override protected void onAttachedToWindow() { super.onAttachedToWindow(); removeCallbacks(tick); postDelayed(tick, 60_000); }
    @Override protected void onDetachedFromWindow() { removeCallbacks(tick); super.onDetachedFromWindow(); }

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
            case KeyEvent.KEYCODE_DPAD_UP: if (selRow == 0) return false; moveRow(-1); if (onClock && !hasCatchup(selRow)) onClock = false; return true;
            case KeyEvent.KEYCODE_DPAD_DOWN: moveRow(1); if (onClock && !hasCatchup(selRow)) onClock = false; return true;
            case KeyEvent.KEYCODE_PAGE_UP: case KeyEvent.KEYCODE_CHANNEL_UP: moveRow(-visibleRows()); return true;
            case KeyEvent.KEYCODE_PAGE_DOWN: case KeyEvent.KEYCODE_CHANNEL_DOWN: moveRow(visibleRows()); return true;
            case KeyEvent.KEYCODE_DPAD_RIGHT: if (onClock) { onClock = false; invalidate(); return true; } moveTime(true); return true;
            case KeyEvent.KEYCODE_DPAD_LEFT:
                // Already at "now": the next press left only highlights the catch up clock; OK opens it.
                if (onClock) { if (leftEdge != null) { onClock = false; invalidate(); leftEdge.run(); } return true; }
                if (selTime <= now() + 1 && windowStart <= minStart() && hasCatchup(selRow)) { onClock = true; invalidate(); return true; }
                // TV boxes: Left at "now" (past the clock) slides the categories out.
                if (selTime <= now() + 1 && windowStart <= minStart() && leftEdge != null) { leftEdge.run(); return true; }
                moveTime(false); return true;
            case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER: case KeyEvent.KEYCODE_NUMPAD_ENTER:
                if (e.getRepeatCount() > 0) return true;
                if (onClock && hasCatchup(selRow)) { if (listener != null) listener.onCatchup(selRow); return true; }
                if (listener != null && !names.isEmpty()) listener.onPick(selRow, selected()); return true;
        }
        return super.onKeyDown(k, e);
    }

    private boolean onClock;
    private Runnable leftEdge;
    /** Called when Left is pressed with nowhere further left to go (TV boxes open the categories). */
    public void setOnLeftEdge(Runnable r) { leftEdge = r; }
    private boolean hasCatchup(int r) { return r >= 0 && r < catchup.size() && catchup.get(r); }

    private float touchX, touchY, scrollY;
    private int touchTop;
    private boolean dragging, dragX, touchActive;
    private long touchWin;

    @Override public boolean onTouchEvent(android.view.MotionEvent e) {
        switch (e.getActionMasked()) {
            case android.view.MotionEvent.ACTION_DOWN:
                touchActive = true;
                touchX = e.getX(); touchY = scrollY = e.getY(); touchTop = topRow; touchWin = windowStart; dragging = false; dragX = false;
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
                requestFocus();
                return true;
            case android.view.MotionEvent.ACTION_MOVE:
                if (!touchActive) return true;
                int slop = android.view.ViewConfiguration.get(getContext()).getScaledTouchSlop();
                if (!dragging && (Math.abs(e.getY() - touchY) > slop || Math.abs(e.getX() - touchX) > slop)) {
                    dragging = true;
                    dragX = Math.abs(e.getX() - touchX) > Math.abs(e.getY() - touchY);
                    if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
                }
                if (dragging && dragX) {
                    float pps = Math.max(1f, getWidth() - chW()) / WINDOW;
                    long shift = (long) ((touchX - e.getX()) / pps) / SLOT * SLOT;
                    long ws = Math.max(minStart(), touchWin + shift);
                    if (ws != windowStart) {
                        windowStart = ws;
                        selTime = Math.max(now(), windowStart + 60);
                        if (selTime >= windowStart + WINDOW) selTime = windowStart + 60;
                        onClock = false; invalidate(); changed();
                    }
                } else if (dragging && !names.isEmpty()) {
                    scrollY = e.getY();
                    topRow = Math.max(0, Math.min(Math.max(0, names.size() - visibleRows()),
                            touchTop + Math.round((touchY - scrollY) / rowH())));
                    selRow = Math.max(topRow, Math.min(selRow, Math.min(names.size() - 1, topRow + visibleRows() - 1)));
                    onClock = false;
                    invalidate(); changed();
                }
                return true;
            case android.view.MotionEvent.ACTION_UP:
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(false);
                if (!touchActive) return true;
                touchActive = false;
                if (dragging || Math.abs(e.getX() - touchX) > android.view.ViewConfiguration.get(getContext()).getScaledTouchSlop()) return true;
                if (e.getY() <= headH()) return true;
                int r = topRow + (int) ((e.getY() - headH()) / rowH());
                if (r < 0 || r >= names.size()) return true;
                selRow = r; onClock = false;
                if (e.getX() >= chW()) {
                    buildAxis(chW(), getWidth() - chW());
                    for (int i = 0; i + 1 < axX.length; i++) if (e.getX() >= axX[i] && e.getX() <= axX[i + 1]) {
                        selTime = axT[i] + (long) ((axT[i + 1] - axT[i]) * (e.getX() - axX[i]) / Math.max(1f, axX[i + 1] - axX[i]));
                        break;
                    }
                }
                invalidate(); changed();
                if (listener != null) {
                    if (hasCatchup(r) && e.getX() >= chW() - 32 * d && e.getX() < chW()) listener.onCatchup(r);
                    // A tap on the channel name picks the channel itself, never a later programme left selected.
                    else listener.onPick(r, e.getX() < chW() ? null : selected());
                }
                performClick();
                return true;
            case android.view.MotionEvent.ACTION_CANCEL:
                touchActive = false;
                dragging = false;
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(false);
                return true;
        }
        return true;
    }

    @Override public boolean performClick() { super.performClick(); return true; }

    private String hhmm(long s) {
        java.util.Calendar c = java.util.Calendar.getInstance(); c.setTimeInMillis(s * 1000);
        return String.format(java.util.Locale.UK, "%02d:%02d", c.get(java.util.Calendar.HOUR_OF_DAY), c.get(java.util.Calendar.MINUTE));
    }

    @Override protected void onSizeChanged(int w, int h, int ow, int oh) { super.onSizeChanged(w, h, ow, oh); post(this::changed); }

    // Shared time axis: every boundary (programme start/end on screen, half-hours) gets a column edge.
    // Short segments are given a readable minimum width and the rest share the remaining space,
    // so every row and the header use the same positions and short shows line up with their times.
    private long[] axT = new long[0]; private float[] axX = new float[0];
    private void buildAxis(float ch, float gridW) {
        java.util.TreeSet<Long> b = new java.util.TreeSet<>();
        long ws = windowStart, we = windowStart + WINDOW;
        b.add(ws); b.add(we);
        for (long t = ws; t < we; t += SLOT) b.add(t);
        int v = visibleRows() + 1;
        for (int i = 0; i < v && topRow + i < names.size(); i++) {
            List<Prog> l = progs.get(topRow + i); if (l == null) continue;
            for (Prog p : l) {
                long en = p.en > p.st ? p.en : p.st + SLOT;
                if (p.st > ws && p.st < we) b.add(p.st);
                if (en > ws && en < we) b.add(en);
            }
        }
        axT = new long[b.size()]; int k = 0; for (long t : b) axT[k++] = t;
        int n = axT.length - 1; float[] w = new float[Math.max(n, 0)];
        float minSeg = (phone ? 60 : 90) * d, fixed = 0; long rest = 0;
        boolean[] small = new boolean[w.length];
        float base = gridW / WINDOW;
        for (int i = 0; i < n; i++) { long dur = axT[i + 1] - axT[i]; if (dur * base < minSeg) { small[i] = true; fixed += minSeg; } else rest += dur; }
        float left = Math.max(gridW * 0.3f, gridW - fixed);
        float scaleSmall = fixed > gridW - gridW * 0.3f ? (gridW * 0.7f) / Math.max(1, fixed) : 1f;
        for (int i = 0; i < n; i++) { long dur = axT[i + 1] - axT[i]; w[i] = small[i] ? minSeg * scaleSmall : (rest > 0 ? left * dur / (float) rest : 0); }
        axX = new float[axT.length]; axX[0] = ch;
        for (int i = 0; i < n; i++) axX[i + 1] = axX[i] + w[i];
    }
    private float xAt(long t) {
        if (axT.length < 2) return chW();
        if (t <= axT[0]) return axX[0];
        for (int i = 0; i < axT.length - 1; i++)
            if (t <= axT[i + 1]) return axX[i] + (axX[i + 1] - axX[i]) * (t - axT[i]) / (float) Math.max(1, axT[i + 1] - axT[i]);
        return axX[axX.length - 1];
    }

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
        buildAxis(ch, gridW);
        // Header marks: half-hours plus every programme start on the highlighted channel,
        // so a short show's start time sits right above its box.
        java.util.TreeSet<Long> marks = new java.util.TreeSet<>();
        for (long t = windowStart; t < windowStart + WINDOW; t += SLOT) marks.add(t);
        List<Prog> sl = selRow >= 0 && selRow < progs.size() ? progs.get(selRow) : null;
        if (sl != null) for (Prog p : sl) if (p.st > windowStart && p.st < windowStart + WINDOW) marks.add(p.st);
        float lastLabel = -1e9f;
        for (long t : marks) {
            float x = xAt(t);
            boolean half = (t - windowStart) % SLOT == 0;
            fill.setColor(half ? 0xFF334155 : 0xFF475569); c.drawRect(x, half ? 0 : hh * 0.75f, x + 1, half ? H : hh, fill);
            float w = txt.measureText(hhmm(t));
            if (x + 4 * d >= lastLabel) { txt.setColor(half ? 0xFFF1F5F9 : 0xFFFDE68A); c.drawText(hhmm(t), x + 4 * d, hh * 0.68f, txt); lastLabel = x + 4 * d + w + 6 * d; }
        }
        txt.setColor(0xFFF1F5F9);
        int v = visibleRows() + 1;
        for (int i = 0; i < v && topRow + i < names.size(); i++) {
            int r = topRow + i;
            float y = hh + i * rh;
            boolean selR = r == selRow;
            fill.setColor(selR ? 0xFF1E2C4D : 0xFF16213A);
            c.drawRect(0, y + 1, ch - 2, y + rh - 1, fill);
            txt.setColor(0xFFF1F5F9); txt.setTextSize(15 * d); txt.setFakeBoldText(selR);
            String label = (r + 1) + "  " + names.get(r);
            float clockW = hasCatchup(r) ? 26 * d : 0;
            float available = ch - 16 * d - clockW;
            if (selR && isFocused() && txt.measureText(label) > available) {
                if (marqueeRow != r) { marqueeRow = r; marqueeStarted = android.os.SystemClock.uptimeMillis(); }
                float offset = ChannelMarquee.offset(txt.measureText(label), available, android.os.SystemClock.uptimeMillis() - marqueeStarted, d);
                c.save(); c.clipRect(8 * d, y, 8 * d + available, y + rh);
                c.drawText(label, 8 * d - offset, y + rh / 2 + 5 * d, txt); c.restore();
                postInvalidateDelayed(33);
            } else {
                if (selR) marqueeRow = -1;
                c.drawText(TextUtils.ellipsize(label, txt, available, TextUtils.TruncateAt.END).toString(), 8 * d, y + rh / 2 + 5 * d, txt);
            }
            if (clockW > 0 && selR && onClock) drawRing(c, new RectF(ch - clockW - 6 * d, y + 4 * d, ch - 2 * d, y + rh - 4 * d));
            if (clockW > 0) { txt.setTextSize(17 * d); c.drawText("🕘", ch - clockW - 2 * d, y + rh / 2 + 6 * d, txt); txt.setTextSize(15 * d); }
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
            c.save(); c.clipRect(ch, y, W, y + rh);
            for (int pi = 0; pi < l.size(); pi++) {
                Prog p = l.get(pi);
                long en = p.en > p.st ? p.en : p.st + SLOT;
                // Never let a box run over the next programme's start (overlapping EPG data).
                if (pi + 1 < l.size() && l.get(pi + 1).st > p.st && l.get(pi + 1).st < en) en = l.get(pi + 1).st;
                if (en <= windowStart || p.st >= windowStart + WINDOW) continue;
                float x1 = xAt(Math.max(p.st, windowStart));
                float x2 = xAt(Math.min(en, windowStart + WINDOW));
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
                boolean reminderIcon = GuideReminder.eligible(p, nowS);
                String t = p.title;
                float pad = box.width() < 60 * d ? 3 * d : 6 * d;
                float iconW = reminderIcon ? Math.min(30 * d, box.width()) : 0;
                float avail = box.width() - 2 * pad - iconW;
                c.save(); c.clipRect(box);
                if (reminderIcon) {
                    Paint bell = new Paint(Paint.ANTI_ALIAS_FLAG);
                    bell.setColor(rem ? 0xFFF9C55B : 0xFFF1F5F9); bell.setStyle(Paint.Style.STROKE); bell.setStrokeWidth(2 * d);
                    float cx = box.right - iconW / 2, cy = y + rh / 2;
                    c.drawArc(new RectF(cx - 6 * d, cy - 9 * d, cx + 6 * d, cy + 3 * d), 180, 180, false, bell);
                    c.drawLine(cx - 6 * d, cy - 3 * d, cx - 7 * d, cy + 5 * d, bell);
                    c.drawLine(cx + 6 * d, cy - 3 * d, cx + 7 * d, cy + 5 * d, bell);
                    c.drawLine(cx - 8 * d, cy + 5 * d, cx + 8 * d, cy + 5 * d, bell);
                    c.drawArc(new RectF(cx - 2 * d, cy + 5 * d, cx + 2 * d, cy + 9 * d), 0, 180, false, bell);
                }
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
            float x = xAt(nowS);
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
