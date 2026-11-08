const {test,expect}=require('bun:test');
const {guideAction,reminderEligible}=require('../guide-action.cjs');
test('upcoming programme on another channel opens reminder, never preview',()=>{
 expect(guideAction({id:'2'},{start:200,end:300,title:'Match'},{id:'1'},100)).toBe('reminder');
 expect(guideAction({id:'2'},{start:200,end:300,title:'Match'},null,100)).toBe('reminder');
});
test('current programme and channel clicks retain preview',()=>{
 expect(guideAction({id:'2'},{start:50,end:150,title:'Match'},null,100)).toBe('preview');
 expect(guideAction({id:'2'},null,null,100)).toBe('preview');
});
test('empty event slots cannot set reminders',()=>{
 expect(reminderEligible({start:200,title:'No Event Scheduled'},100)).toBe(false);
 expect(guideAction({id:'2'},{start:200,title:'No Event Scheduled'},null,100)).toBe('none');
});