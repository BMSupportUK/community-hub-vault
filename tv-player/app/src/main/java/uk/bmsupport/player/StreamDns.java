package uk.bmsupport.player;

/** Stream lookups through Private DNS: when the box's own lookup of a stream server fails (a broadband block), swap the name for the privately looked-up address. */
final class StreamDns {
    private StreamDns() {}
    static String host(String url) {
        try { return java.net.URI.create(url).getHost(); } catch (Exception e) { return null; }
    }
    /** Same URL with its server name replaced by ip; unchanged if it can't be rewritten. */
    static String withIp(String url, String ip) {
        String h = host(url);
        if (h == null || ip == null || ip.isEmpty()) return url;
        int i = url.indexOf("//" + h);
        return i < 0 ? url : url.substring(0, i + 2) + ip + url.substring(i + 2 + h.length());
    }
    /** Called off the main thread: returns a rewritten URL only when normal DNS fails and Private DNS answers. */
    static String unblock(String url) {
        if (!PrivateDns.enabled || url == null || !url.startsWith("http://")) return null;
        String h = host(url);
        if (h == null || h.matches("[\\d.]+")) return null;
        try { java.net.InetAddress.getByName(h); return null; } catch (Exception blocked) { }
        String ip = PrivateDns.resolve(h);
        return ip == null ? null : withIp(url, ip);
    }
}
