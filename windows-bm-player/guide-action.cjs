function reminderEligible(programme, now){return !!programme&&programme.start>now&&!/^no event scheduled$/i.test(programme.title||'');}
function guideAction(channel,programme,selected,now){
 if(reminderEligible(programme,now))return 'reminder';
 if(programme&&programme.start>now)return 'none';
 if(!selected||selected.id!==channel.id)return 'preview';
 if(programme&&programme.end<=now)return 'ended';
 return 'choose';
}
module.exports={reminderEligible,guideAction};