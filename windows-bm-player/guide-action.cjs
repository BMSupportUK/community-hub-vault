function reminderEligible(programme, now){return !!programme&&programme.start>now&&!/^no event scheduled$/i.test(programme.title||'');}
function guideAction(channel,programme,selected,now){
 if(reminderEligible(programme,now))return 'reminder';
 if(programme&&programme.start>now)return 'none';
 if(!selected||selected.id!==channel.id)return 'preview';
 if(programme&&programme.end<=now)return 'ended';
 return 'choose';
}
// The ⛶ on the preview box opens the channel that preview is showing; nothing shows until a preview is up.
function previewFullScreen(playing){return playing&&playing.length>0?playing[0].item:null;}
module.exports={reminderEligible,guideAction,previewFullScreen};