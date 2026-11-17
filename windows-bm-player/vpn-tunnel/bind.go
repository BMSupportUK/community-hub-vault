package main

import "golang.zx2c4.com/wireguard/conn"

// App-private networking never mutates system routes; wrapping the official bind
// avoids Linux's optional privileged netlink route listener in sandbox tests.
type appBind struct{ conn.Bind }
func newAppBind() conn.Bind { return &appBind{conn.NewDefaultBind()} }