// Home-screen themes (shared by Windows and Mac): only pictures from our own website are accepted.
const PREFIX='https://bmsupport.uk/player-themes/';
function clean(items){return (Array.isArray(items)?items:[]).filter(t=>t&&typeof t.id==='string'&&typeof t.image==='string'&&t.image.startsWith(PREFIX)).slice(0,100).map(t=>({id:t.id.slice(0,40),name:String(t.name||'').slice(0,60),group:String(t.group||'').slice(0,30),image:t.image,accent:/^#[0-9a-fA-F]{6}$/.test(t.accent||'')?t.accent:null}));}
function safeImage(theme){return theme&&typeof theme.image==='string'&&theme.image.startsWith(PREFIX)&&!/["()\\\s]/.test(theme.image)?theme.image:null;}
function stillOffered(theme,items){return !theme||!Array.isArray(items)||items.some(t=>t.id===theme.id);}
// Picture shading the customer picks in Settings: [top, middle, bottom] darkness. Medium is the default.
const SHADES={light:[0.30,0.05,0.25],medium:[0.45,0.15,0.40],strong:[0.70,0.40,0.65]};
function shadeId(id){return Object.prototype.hasOwnProperty.call(SHADES,id)?id:'medium';}
function safeAccent(theme){return theme&&/^#[0-9a-fA-F]{6}$/.test(theme.accent||'')?theme.accent:null;}
function hex(a){return Math.round(a*255).toString(16).padStart(2,'0');}
// Home screen style for a theme: lighter shading in the middle so the picture shows; the layout itself never changes.
function homeStyle(theme,shade){const img=safeImage(theme);if(!img)return undefined;const [t,m,b]=SHADES[shadeId(shade)];const style={backgroundImage:'linear-gradient(#101219'+hex(t)+',#101219'+hex(m)+' 45%,#101219'+hex(b)+'),url("'+img+'")',backgroundSize:'cover',backgroundPosition:'center top'};const a=safeAccent(theme);if(a)style['--accent']=a;return style;}
module.exports={clean,safeImage,stillOffered,PREFIX,SHADES,shadeId,safeAccent,homeStyle};
