package uk.bmsupport.remote;

import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjection;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.webrtc.DataChannel;
import org.webrtc.DefaultVideoDecoderFactory;
import org.webrtc.DefaultVideoEncoderFactory;
import org.webrtc.EglBase;
import org.webrtc.IceCandidate;
import org.webrtc.MediaConstraints;
import org.webrtc.MediaStream;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.RtpReceiver;
import org.webrtc.ScreenCapturerAndroid;
import org.webrtc.SessionDescription;
import org.webrtc.SurfaceTextureHelper;
import org.webrtc.VideoSource;

/** Captures the TV screen and offers it to staff over WebRTC, signalled through the realtime topic. */
public final class ScreenShare {
    private final Context ctx;
    private final Realtime rt;
    private final Intent permission;
    private final JSONArray ice;
    private final EglBase egl;
    private PeerConnectionFactory factory;
    private PeerConnection pc;
    private ScreenCapturerAndroid capturer;
    private VideoSource source;

    public ScreenShare(Context ctx, Realtime rt, Intent permission, JSONArray ice) {
        this.ctx = ctx;
        this.rt = rt;
        this.permission = permission;
        this.ice = ice;
        this.egl = EglBase.create();
    }

    public void start() {
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(ctx).createInitializationOptions());
        factory = PeerConnectionFactory.builder()
                .setVideoEncoderFactory(new DefaultVideoEncoderFactory(egl.getEglBaseContext(), true, true))
                .setVideoDecoderFactory(new DefaultVideoDecoderFactory(egl.getEglBaseContext()))
                .createPeerConnectionFactory();

        List<PeerConnection.IceServer> servers = new ArrayList<>();
        for (int i = 0; i < ice.length(); i++) {
            JSONObject s = ice.optJSONObject(i);
            if (s == null) continue;
            Object urls = s.opt("urls");
            List<String> urlList = new ArrayList<>();
            if (urls instanceof JSONArray) {
                JSONArray arr = (JSONArray) urls;
                for (int j = 0; j < arr.length(); j++) urlList.add(arr.optString(j));
            } else if (urls != null) {
                urlList.add(urls.toString());
            }
            servers.add(PeerConnection.IceServer.builder(urlList)
                    .setUsername(s.optString("username", ""))
                    .setPassword(s.optString("credential", ""))
                    .createIceServer());
        }

        PeerConnection.RTCConfiguration config = new PeerConnection.RTCConfiguration(servers);
        config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN;
        pc = factory.createPeerConnection(config, new PeerConnection.Observer() {
            @Override
            public void onIceCandidate(IceCandidate c) {
                try {
                    rt.send("ice", new JSONObject()
                            .put("from", "tv")
                            .put("candidate", new JSONObject()
                                    .put("candidate", c.sdp)
                                    .put("sdpMid", c.sdpMid)
                                    .put("sdpMLineIndex", c.sdpMLineIndex)));
                } catch (Throwable ignore) {
                }
            }

            @Override
            public void onAddStream(MediaStream s) {}

            @Override
            public void onAddTrack(RtpReceiver r, MediaStream[] s) {}

            @Override
            public void onDataChannel(DataChannel d) {}

            @Override
            public void onIceCandidatesRemoved(IceCandidate[] c) {}

            @Override
            public void onIceConnectionChange(PeerConnection.IceConnectionState s) {}

            @Override
            public void onIceConnectionReceivingChange(boolean b) {}

            @Override
            public void onIceGatheringChange(PeerConnection.IceGatheringState s) {}

            @Override
            public void onRemoveStream(MediaStream s) {}

            @Override
            public void onRenegotiationNeeded() {}

            @Override
            public void onSignalingChange(PeerConnection.SignalingState s) {}
        });

        capturer = new ScreenCapturerAndroid(permission, new MediaProjection.Callback() {
            @Override
            public void onStop() {
                rt.send("screen_off", new JSONObject());
            }
        });
        source = factory.createVideoSource(true);
        SurfaceTextureHelper helper = SurfaceTextureHelper.create("screen", egl.getEglBaseContext());
        capturer.initialize(helper, ctx, source.getCapturerObserver());
        capturer.startCapture(1280, 720, 15);
        pc.addTrack(factory.createVideoTrack("screen", source), Collections.singletonList("tv"));
        offer();
    }

    public void offer() {
        final PeerConnection peer = pc;
        if (peer == null) return;
        peer.createOffer(new SdpAdapter() {
            @Override
            public void onCreateSuccess(SessionDescription d) {
                peer.setLocalDescription(new SdpAdapter(), d);
                try {
                    rt.send("offer", new JSONObject().put("sdp", d.description));
                } catch (Throwable ignore) {
                }
            }
        }, new MediaConstraints());
    }

    public void answer(String sdp) {
        PeerConnection peer = pc;
        if (peer == null) return;
        peer.setRemoteDescription(new SdpAdapter(), new SessionDescription(SessionDescription.Type.ANSWER, sdp));
    }

    public void ice(JSONObject c) {
        PeerConnection peer = pc;
        if (peer == null || c == null) return;
        peer.addIceCandidate(new IceCandidate(c.optString("sdpMid"), c.optInt("sdpMLineIndex"), c.optString("candidate")));
    }

    public void stop() {
        try {
            if (capturer != null) capturer.stopCapture();
        } catch (Throwable ignore) {
        }
        if (capturer != null) capturer.dispose();
        if (source != null) source.dispose();
        if (pc != null) pc.close();
        egl.release();
    }
}
