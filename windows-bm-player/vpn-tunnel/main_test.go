package main

import (
 "context"
 "crypto/rand"
 "encoding/base64"
 "fmt"
 "io"
 "net"
 "net/http"
 "net/http/httptest"
 "net/netip"
 "strings"
 "testing"
 "time"

 "golang.org/x/crypto/curve25519"
 "golang.zx2c4.com/wireguard/device"
 "golang.zx2c4.com/wireguard/tun/netstack"
)
func keys() (string,string) {b:=make([]byte,32);rand.Read(b);pub,_:=curve25519.X25519(b,curve25519.Basepoint);return base64.StdEncoding.EncodeToString(b),base64.StdEncoding.EncodeToString(pub)}
func testConfig(priv,pub,endpoint string)string{return fmt.Sprintf("[Interface]\nPrivateKey = %s\nAddress = 10.55.0.2/32\nDNS = 10.55.0.1\n[Peer]\nPublicKey = %s\nAllowedIPs = 0.0.0.0/0\nEndpoint = %s\n",priv,pub,endpoint)}
func TestEncryptedWireGuardStreaming(t *testing.T){
 serverPriv,serverPub:=keys();clientPriv,clientPub:=keys()
 sock,e:=net.ListenPacket("udp4","127.0.0.1:0");if e!=nil{t.Fatal(e)};endpoint:=sock.LocalAddr().String();_,port,_:=net.SplitHostPort(endpoint);sock.Close()
 tun,stack,e:=netstack.CreateNetTUN([]netip.Addr{netip.MustParseAddr("10.55.0.1")},nil,1280);if e!=nil{t.Fatal(e)}
 peer:=device.NewDevice(tun,newAppBind(),device.NewLogger(device.LogLevelSilent,""));defer peer.Close()
 priv,_:=keyHex(serverPriv);pub,_:=keyHex(clientPub)
 if e=peer.IpcSet("private_key="+priv+"\nlisten_port="+port+"\npublic_key="+pub+"\nallowed_ip=10.55.0.2/32\n");e!=nil{t.Fatal(e)};if e=peer.Up();e!=nil{t.Fatal(e)}
 listener,e:=stack.ListenTCP(&net.TCPAddr{IP:net.ParseIP("10.55.0.1"),Port:8080});if e!=nil{t.Fatal(e)};defer listener.Close()
 srv:=&http.Server{Handler:http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){if r.URL.Path=="/live.m3u8"{w.Header().Set("Content-Type","application/vnd.apple.mpegurl");io.WriteString(w,"#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"key\"\nsegment.ts\n");return};io.WriteString(w,"encrypted-stream")})};defer srv.Close();go srv.Serve(listener)
 dev,client,e:=newTunnel(testConfig(clientPriv,serverPub,endpoint));if e!=nil{t.Fatal(e)};defer dev.Close()
 ctx,cancel:=context.WithTimeout(context.Background(),10*time.Second);defer cancel();req,_:=http.NewRequestWithContext(ctx,"GET","http://10.55.0.1:8080/segment.ts",nil);res,e:=client.Do(req);if e!=nil{t.Fatal(e)};body,_:=io.ReadAll(res.Body);res.Body.Close();if string(body)!="encrypted-stream"{t.Fatalf("wrong encrypted response: %q",body)}
 transport:=&tunnel{dev:dev,client:client,enabled:true,secret:make([]byte,32)};if !transport.connected(){t.Fatal("real peer handshake not recorded")}
 local:=httptest.NewServer(transport);defer local.Close();transport.base=local.URL
 res,e=http.Get(transport.signed("http://10.55.0.1:8080/live.m3u8"));if e!=nil{t.Fatal(e)};body,_=io.ReadAll(res.Body);res.Body.Close();if strings.Contains(string(body),"10.55.0.1"){t.Fatal("playlist leaked upstream address")};lines:=strings.Split(string(body),"\n");res,e=http.Get(lines[2]);if e!=nil{t.Fatal(e)};body,_=io.ReadAll(res.Body);res.Body.Close();if string(body)!="encrypted-stream"{t.Fatal("segment did not pass through encrypted peer")}
}
func TestUnsignedProxyRequestsDenied(t *testing.T){tr:=&tunnel{secret:make([]byte,32)};r:=httptest.NewRecorder();tr.ServeHTTP(r,httptest.NewRequest("GET","http://localhost/s/anything/wrong/stream",nil));if r.Code!=403{t.Fatalf("status %d",r.Code)}}
func TestFailedTunnelNeverFallsBack(t *testing.T){tr:=&tunnel{secret:make([]byte,32),enabled:true,base:"http://localhost"};r:=httptest.NewRecorder();tr.ServeHTTP(r,httptest.NewRequest("GET",tr.signed("http://127.0.0.1:9/stream.ts"),nil));if r.Code!=503{t.Fatalf("status %d",r.Code)}}
func TestRejectExecutableConfigHooks(t *testing.T){priv,pub:=keys();for _,hook:=range []string{"PostUp=evil","PreDown=evil","SaveConfig=true"}{_,_,_,e:=parseConfig(testConfig(priv,pub,"127.0.0.1:51820")+hook);if e==nil{t.Fatalf("accepted %s",hook)}}}
func TestUnknownPeerNeverConnected(t *testing.T){priv,pub:=keys();dev,client,e:=newTunnel(testConfig(priv,pub,"127.0.0.1:9"));if e!=nil{t.Fatal(e)};defer dev.Close();tr:=&tunnel{dev:dev,client:client,enabled:true};if tr.connected(){t.Fatal("green without peer handshake")}}
func TestDohParsePicksIPv4Answer(t *testing.T){if got:=dohParse([]byte(`{"Status":0,"Answer":[{"type":5,"data":"x."},{"type":1,"data":"1.2.3.4"}]}`));got!="1.2.3.4"{t.Fatal(got)};if dohParse([]byte(`{"Status":3}`))!=""{t.Fatal("nxdomain")}}
