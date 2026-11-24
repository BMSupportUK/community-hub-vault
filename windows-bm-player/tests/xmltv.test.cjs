const {test,expect}=require('bun:test');
const xmltv=require('../xmltv.cjs');const core=require('../core.cjs');
test('one guide file is grouped per channel, past shows dropped, times and names kept',()=>{
 const now=Date.UTC(2026,10,24,18,0);
 const text=`<tv><programme start="20261124170000 +0000" stop="20261124175900 +0000" channel="BBC1.uk"><title>Old</title></programme>
 <programme start="20261124190000 +0100" stop="20261124200000 +0100" channel="BBC1.uk"><title lang="en">News &amp; Weather</title><desc>Latest</desc></programme>
 <programme start="20261124190000 +0000" stop="20261124200000 +0000" channel="ITV1.uk"><title>Corrie</title></programme></tv>`;
 const map=xmltv.parse(text,now);
 const bbc=core.programmes(map.get('bbc1.uk'));
 expect(bbc).toHaveLength(1);expect(bbc[0].title).toBe('News & Weather');expect(bbc[0].desc).toBe('Latest');
 expect(bbc[0].start).toBe(Date.UTC(2026,10,24,18,0));
 expect(core.programmes(map.get('itv1.uk'))[0].title).toBe('Corrie');
});
