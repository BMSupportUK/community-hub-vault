// Home-screen themes (shared by Windows and Mac): only pictures from our own website are accepted.
const PREFIX='https://bmsupport.uk/player-themes/';
function clean(items){return (Array.isArray(items)?items:[]).filter(t=>t&&typeof t.id==='string'&&typeof t.image==='string'&&t.image.startsWith(PREFIX)).slice(0,100).map(t=>({id:t.id.slice(0,40),name:String(t.name||'').slice(0,60),group:String(t.group||'').slice(0,30),image:t.image}));}
function safeImage(theme){return theme&&typeof theme.image==='string'&&theme.image.startsWith(PREFIX)&&!/["()\\\s]/.test(theme.image)?theme.image:null;}
function stillOffered(theme,items){return !theme||!Array.isArray(items)||items.some(t=>t.id===theme.id);}
module.exports={clean,safeImage,stillOffered,PREFIX};
