import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test,expect} from 'bun:test';
import {VideoSurface} from '../renderer/video-surface';

test('radio preview and full screen show the DJ studio while hiding only the native picture surface',()=>{
 const html=renderToStaticMarkup(<VideoSurface index={0} audioOnly={true}/>);
 expect(html).toContain('radio_studio.jpg');
 expect(html).toContain('Radio station DJ mixing songs in the studio');
 expect(html).toContain('data-video-visible="false"');
});

test('ordinary television keeps its native picture and never shows radio artwork',()=>{
 const html=renderToStaticMarkup(<VideoSurface index={0}/>);
 expect(html).toContain('data-video-visible="true"');
 expect(html).not.toContain('radio_studio.jpg');
});
