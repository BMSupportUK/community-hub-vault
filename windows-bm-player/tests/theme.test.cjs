const {test,expect}=require('bun:test');
const theme=require('../theme.cjs');
const boro={id:'middlesbrough',name:'Middlesbrough',group:'Football',image:'https://bmsupport.uk/player-themes/middlesbrough.jpg'};
test('a theme the owner switched off or deleted is no longer offered',()=>{
 expect(theme.stillOffered(boro,[boro])).toBe(true);
 expect(theme.stillOffered(boro,[])).toBe(false);
});
test('only pictures from the BM Support website are used',()=>{
 expect(theme.clean([boro,{...boro,id:'x',image:'https://evil.example/x.jpg'}]).map(t=>t.id)).toEqual(['middlesbrough']);
 expect(theme.safeImage({image:'https://bmsupport.uk/player-themes/a.jpg") , url("x'})).toBe(null);
 expect(theme.safeImage(boro)).toBe(boro.image);
});
