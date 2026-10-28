package uk.bmsupport.remote;

/** A paired TV session: id + device token prove ownership to the website; topic is the realtime channel. */
public final class Session {
    public final String id;
    public final String token;
    public final String topic;

    public Session(String id, String token, String topic) {
        this.id = id;
        this.token = token;
        this.topic = topic;
    }
}
