# Embedded desktop VPN

The desktop tunnel uses the official WireGuard Go userspace implementation and its in-process network stack. It needs no administrator privileges because it protects BM Player traffic rather than changing system routes.

Configuration and the local proxy capability are supplied on standard input, never command arguments, renderer IPC, logs or disk. The helper binds only to loopback. Streaming destinations are registered privately by the Electron main process. An enabled tunnel fails closed: it must never fall back to a direct provider connection.

Release checks must exercise an actual encrypted WireGuard peer, HTTP streaming through the tunnel, denied unauthenticated requests, and failed handshakes. Both target architectures must be compiled before packaging.