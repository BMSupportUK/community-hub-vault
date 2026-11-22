// BM Player's private userspace WireGuard streaming transport.
package main

import (
 "bufio"
 "context"
 "crypto/hmac"
 "crypto/sha256"
 "encoding/base64"
 "encoding/hex"
 "encoding/json"
 "errors"
 "io"
 "net"
 "net/http"
 "net/netip"
 "net/url"
 "os"
 "strconv"
 "strings"
 "sync"
 "time"

 "golang.zx2c4.com/wireguard/device"
 "golang.zx2c4.com/wireguard/tun/netstack"
)

type tunnel struct { mu sync.RWMutex; dev *device.Device; client *http.Client; enabled bool; secret []byte; base string }
type command struct { ID int `json:"id"`; Action string `json:"action"`; Config string `json:"config"`; Secret string `json:"secret"` }

func keyHex(v string) (string,error) { b,e:=base64.StdEncoding.DecodeString(v);if e!=nil||len(b)!=32{return "",errors.New("invalid key")};return hex.EncodeToString(b),nil }
// Only the WireGuard fields needed by this transport are accepted. No hooks or shell commands.
func parseConfig(text string) (ips,dns []netip.Addr,ipc string,err error) {
 if len(text)>32768 {err=errors.New("configuration too large");return}
 section:=""; fields:=map[string]string{};peer:=false
 for _,line:=range strings.Split(text,"\n") {line=strings.TrimSpace(line);if line==""||strings.HasPrefix(line,"#"){continue};if strings.HasPrefix(line,"["){if line!="[Interface]"&&line!="[Peer]"{err=errors.New("invalid section");return};if line=="[Peer]"&&peer{err=errors.New("multiple peers");return};section=line;if line=="[Peer]"{peer=true};continue};p:=strings.SplitN(line,"=",2);if len(p)!=2||section==""{err=errors.New("invalid field");return};k,v:=strings.TrimSpace(p[0]),strings.TrimSpace(p[1]);f:=section+k;if _,ok:=fields[f];ok{err=errors.New("duplicate field");return};fields[f]=v
  switch f {case "[Interface]PrivateKey","[Interface]Address","[Interface]DNS","[Interface]MTU","[Peer]PublicKey","[Peer]PresharedKey","[Peer]Endpoint","[Peer]AllowedIPs","[Peer]PersistentKeepalive":default:err=errors.New("unsupported field");return}
 }
 priv,e:=keyHex(fields["[Interface]PrivateKey"]);if e!=nil{err=e;return};pub,e:=keyHex(fields["[Peer]PublicKey"]);if e!=nil{err=e;return}
 for _,s:=range strings.Split(fields["[Interface]Address"],","){p,e:=netip.ParsePrefix(strings.TrimSpace(s));if e!=nil{err=e;return};ips=append(ips,p.Addr())}
 for _,s:=range strings.Split(fields["[Interface]DNS"],","){a,e:=netip.ParseAddr(strings.TrimSpace(s));if e!=nil{err=errors.New("VPN DNS required");return};dns=append(dns,a)}
 endpoint:=fields["[Peer]Endpoint"];host,port,e:=net.SplitHostPort(endpoint);if e!=nil{err=e;return};n,e:=strconv.Atoi(port);if e!=nil||n<1||n>65535{err=errors.New("invalid endpoint");return}
 addr,e:=netip.ParseAddr(host);if e!=nil{ctx,cancel:=context.WithTimeout(context.Background(),5*time.Second);defer cancel();list,e:=net.DefaultResolver.LookupNetIP(ctx,"ip",host);if e!=nil||len(list)==0{err=errors.New("endpoint unavailable");return};addr=list[0]}
 ipc="private_key="+priv+"\nreplace_peers=true\npublic_key="+pub+"\nendpoint="+net.JoinHostPort(addr.String(),port)+"\nreplace_allowed_ips=true\n"
 allowed:=fields["[Peer]AllowedIPs"];if allowed==""{err=errors.New("missing routes");return};full:=false
 for _,s:=range strings.Split(allowed,","){p,e:=netip.ParsePrefix(strings.TrimSpace(s));if e!=nil{err=e;return};if p.String()=="0.0.0.0/0"{full=true};ipc+="allowed_ip="+p.String()+"\n"};if !full{err=errors.New("full IPv4 route required");return}
 if p:=fields["[Peer]PresharedKey"];p!=""{h,e:=keyHex(p);if e!=nil{err=e;return};ipc+="preshared_key="+h+"\n"}
 ipc+="persistent_keepalive_interval=25\n";return
}

func newTunnel(config string) (*device.Device,*http.Client,error) {
 ips,dns,ipc,e:=parseConfig(config);if e!=nil{return nil,nil,e}
 tun,stack,e:=netstack.CreateNetTUN(ips,dns,1280);if e!=nil{return nil,nil,e}
 // Never log configuration, provider addresses or packet details.
 dev:=device.NewDevice(tun,newAppBind(),device.NewLogger(device.LogLevelSilent,""))
 if e=dev.IpcSet(ipc);e!=nil{dev.Close();return nil,nil,e};if e=dev.Up();e!=nil{dev.Close();return nil,nil,e}
 transport:=&http.Transport{DialContext:stack.DialContext,Proxy:nil,ForceAttemptHTTP2:true,ResponseHeaderTimeout:30*time.Second,IdleConnTimeout:30*time.Second}
 client:=&http.Client{Transport:transport,CheckRedirect:func(r *http.Request,via []*http.Request)error{if len(via)>=8{return errors.New("redirect limit")};if r.URL.Scheme!="http"&&r.URL.Scheme!="https"{return errors.New("invalid redirect")};return nil}}
 return dev,client,nil
}
func (t *tunnel) connect(config string) error {
 t.disconnect(true)
 d,c,e:=newTunnel(config);if e!=nil{return e}
 t.mu.Lock();t.dev=d;t.client=c;t.mu.Unlock()
 // Actual tunnel traffic is needed for the first handshake; a process running is not a connection.
 ctx,cancel:=context.WithTimeout(context.Background(),15*time.Second);defer cancel()
 req,_:=http.NewRequestWithContext(ctx,"GET","https://1.1.1.1/cdn-cgi/trace",nil)
 r,e:=c.Do(req);if e!=nil{t.disconnect(true);return errors.New("tunnel verification failed")};io.Copy(io.Discard,io.LimitReader(r.Body,65536));r.Body.Close()
 if !t.connected(){t.disconnect(true);return errors.New("handshake missing")};return nil
}
func (t *tunnel) connected() bool {
 t.mu.RLock();defer t.mu.RUnlock();if t.dev==nil||!t.enabled{return false};s,e:=t.dev.IpcGet();if e!=nil{return false}
 for _,line:=range strings.Split(s,"\n"){if strings.HasPrefix(line,"last_handshake_time_sec="){n,_:=strconv.ParseInt(strings.TrimPrefix(line,"last_handshake_time_sec="),10,64);return n>0&&time.Since(time.Unix(n,0))<3*time.Minute}}
 return false
}
func (t *tunnel) disconnect(block bool) {t.mu.Lock();d,c:=t.dev,t.client;t.dev=nil;t.client=nil;t.enabled=block;t.mu.Unlock();if c!=nil{c.CloseIdleConnections()};if d!=nil{d.Close()}}
func (t *tunnel) signed(target string) string {encoded:=base64.RawURLEncoding.EncodeToString([]byte(target));mac:=hmac.New(sha256.New,t.secret);mac.Write([]byte(encoded));u,_:=url.Parse(target);return t.base+"/s/"+encoded+"/"+hex.EncodeToString(mac.Sum(nil))+"/stream"+extension(u.Path)}
func extension(path string) string {for _,e:=range []string{".m3u8",".ts",".mp4",".mkv",".vtt",".aac"}{if strings.HasSuffix(strings.ToLower(path),e){return e}};return ""}
func (t *tunnel) target(path string) (string,error) {p:=strings.Split(path,"/");if len(p)!=5||p[1]!="s"{return "",errors.New("unknown stream")};mac:=hmac.New(sha256.New,t.secret);mac.Write([]byte(p[2]));sig,e:=hex.DecodeString(p[3]);if e!=nil||!hmac.Equal(mac.Sum(nil),sig){return "",errors.New("unauthorised")};b,e:=base64.RawURLEncoding.DecodeString(p[2]);if e!=nil{return "",e};u,e:=url.Parse(string(b));if e!=nil||(u.Scheme!="http"&&u.Scheme!="https")||u.Host==""{return "",errors.New("invalid stream")};return u.String(),nil}
func (t *tunnel) playlist(body,base string) string {resolve:=func(s string)string{b,_:=url.Parse(base);r,e:=url.Parse(s);if e!=nil{return ""};return t.signed(b.ResolveReference(r).String())};lines:=strings.Split(body,"\n");for i,line:=range lines{s:=strings.TrimSpace(line);if s==""{continue};if !strings.HasPrefix(s,"#"){lines[i]=resolve(s);continue};for start:=0;;{at:=strings.Index(line[start:],`URI="`);if at<0{break};at+=start+5;end:=strings.Index(line[at:],`"`);if end<0{break};end+=at;v:=resolve(line[at:end]);line=line[:at]+v+line[end:];start=at+len(v)+1};lines[i]=line};return strings.Join(lines,"\n")}
func (t *tunnel) ServeHTTP(w http.ResponseWriter,r *http.Request) {
 if r.Method!="GET"&&r.Method!="HEAD"{http.Error(w,"Not allowed",405);return};target,e:=t.target(r.URL.Path);if e!=nil{http.Error(w,"Stream unavailable",403);return}
 t.mu.RLock();c,enabled:=t.client,t.enabled;t.mu.RUnlock();if enabled&&c==nil{http.Error(w,"VPN unavailable",503);return};if !enabled{tr:=&http.Transport{Proxy:nil};if r.Header.Get("X-BM-DNS")=="private"{tr.DialContext=privateDial};c=&http.Client{Transport:tr,CheckRedirect:func(r *http.Request,via []*http.Request)error{if len(via)>8{return errors.New("redirect limit")};return nil}};defer c.CloseIdleConnections()}
 req,e:=http.NewRequestWithContext(r.Context(),r.Method,target,nil);if e!=nil{http.Error(w,"Stream unavailable",502);return};for _,k:=range []string{"Range","User-Agent","Accept"}{req.Header.Set(k,r.Header.Get(k))}
 upstream,e:=c.Do(req);if e!=nil{http.Error(w,"Stream unavailable",502);return};defer upstream.Body.Close()
 for _,k:=range []string{"Content-Type","Content-Length","Content-Range","Accept-Ranges"}{if v:=upstream.Header.Get(k);v!=""{w.Header().Set(k,v)}};w.Header().Set("Cache-Control","no-store")
 final:=upstream.Request.URL.String();if r.Header.Get("X-BM-Playlist")=="raw"{w.Header().Set("X-BM-Final",final);w.WriteHeader(upstream.StatusCode);io.Copy(w,upstream.Body);return};if strings.Contains(strings.ToLower(upstream.Header.Get("Content-Type")),"mpegurl")||strings.HasSuffix(strings.ToLower(upstream.Request.URL.Path),".m3u8"){
  body,e:=io.ReadAll(io.LimitReader(upstream.Body,4*1024*1024+1));if e!=nil||len(body)>4*1024*1024{http.Error(w,"Playlist unavailable",502);return};w.Header().Del("Content-Length");w.Header().Set("Content-Type","application/vnd.apple.mpegurl");w.WriteHeader(upstream.StatusCode);io.WriteString(w,t.playlist(string(body),final));return
 };w.WriteHeader(upstream.StatusCode);io.Copy(w,upstream.Body)
}
func main(){t:=&tunnel{};defer t.disconnect(true);listener,e:=net.Listen("tcp4","127.0.0.1:0");if e!=nil{os.Exit(1)};defer listener.Close();t.base="http://"+listener.Addr().String();scanner:=bufio.NewScanner(os.Stdin);scanner.Buffer(make([]byte,4096),65536);out:=json.NewEncoder(os.Stdout);server:=&http.Server{Handler:t,ReadHeaderTimeout:5*time.Second,IdleTimeout:30*time.Second,MaxHeaderBytes:16384}
 for scanner.Scan(){var c command;if json.Unmarshal(scanner.Bytes(),&c)!=nil{continue};result:=map[string]any{"id":c.ID,"ok":true};switch c.Action{case "init":secret,e:=hex.DecodeString(c.Secret);if e!=nil||len(secret)!=32||len(t.secret)>0{result["ok"]=false}else{t.secret=secret;go server.Serve(listener);result["base"]=t.base};case "connect":if len(t.secret)==0||t.connect(c.Config)!=nil{result["ok"]=false};case "status":result["connected"]=t.connected();case "off":t.disconnect(false);case "block":t.disconnect(true);default:result["ok"]=false};out.Encode(result)
 };server.Close()
}

// Private DNS (VPN off, channel lists/guide only): look the name up over encrypted DNS, fall back to normal DNS.
var dohServers=[]string{"https://1.1.1.1/dns-query?type=A&name=","https://8.8.8.8/resolve?type=A&name="}
func dohParse(body []byte) string {var r struct{Status int;Answer []struct{Type int `json:"type"`;Data string `json:"data"`}};if json.Unmarshal(body,&r)!=nil||r.Status!=0{return ""};for _,a:=range r.Answer{if a.Type==1{if ip,e:=netip.ParseAddr(a.Data);e==nil&&ip.Is4(){return a.Data}}};return ""}
func dohLookup(ctx context.Context,host string) string {c:=&http.Client{Timeout:3*time.Second};for _,s:=range dohServers{req,e:=http.NewRequestWithContext(ctx,"GET",s+url.QueryEscape(host),nil);if e!=nil{continue};req.Header.Set("Accept","application/dns-json");res,e:=c.Do(req);if e!=nil{continue};b,_:=io.ReadAll(io.LimitReader(res.Body,65536));res.Body.Close();if ip:=dohParse(b);ip!=""{return ip}};return ""}
func privateDial(ctx context.Context,network,addr string) (net.Conn,error) {d:=&net.Dialer{Timeout:10*time.Second};host,port,e:=net.SplitHostPort(addr);if e==nil{if _,pe:=netip.ParseAddr(host);pe!=nil{if ip:=dohLookup(ctx,host);ip!=""{if c,e:=d.DialContext(ctx,network,net.JoinHostPort(ip,port));e==nil{return c,nil}}}};return d.DialContext(ctx,network,addr)}
