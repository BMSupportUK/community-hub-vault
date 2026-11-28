import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test,expect} from 'bun:test';
import {VideoSurface} from '../renderer/video-surface';
import {LiveGuide} from '../renderer/live-guide';

test('radio preview and full screen show the DJ studio while hiding only the native picture surface',()=>{
 const html=renderToStaticMarkup(<VideoSurface index={0} audioOnly={true}/>);
 expect(html).toContain('radio_studio.jpg');
 expect(html).toContain('Radio station DJ mixing songs in the studio');
 expect(html).toContain('data-video-visible="false"');
});

test('the Radio browser lists stations without an EPG grid or day controls',()=>{
 const html=renderToStaticMarkup(<LiveGuide radioMode={true} channels={[{id:'r1',kind:'live',name:'BBC Radio 1',category:'radio'}]} categories={[{id:'radio',name:'UK | Radio'}]} category="all" allCount={1} playing={[]} reminders={[]} cache={{peek:()=>[]}} query="" isFavourite={()=>false}/>);
 expect(html).toContain('lg-radio-list');
 expect(html).toContain('BBC Radio 1');
 expect(html).toContain('radio_studio.jpg');
 expect(html).not.toContain('lg-grid');
 expect(html).not.toContain('Back 24 hours');
});

test('ordinary television keeps its native picture and never shows radio artwork',()=>{
 const html=renderToStaticMarkup(<VideoSurface index={0}/>);
 expect(html).toContain('data-video-visible="true"');
 expect(html).not.toContain('radio_studio.jpg');
});
