package uk.bmsupport.remote;

import org.webrtc.SdpObserver;
import org.webrtc.SessionDescription;

/** No-op SDP observer; override what's needed. */
public class SdpAdapter implements SdpObserver {
    @Override
    public void onCreateSuccess(SessionDescription d) {}

    @Override
    public void onSetSuccess() {}

    @Override
    public void onCreateFailure(String s) {}

    @Override
    public void onSetFailure(String s) {}
}
