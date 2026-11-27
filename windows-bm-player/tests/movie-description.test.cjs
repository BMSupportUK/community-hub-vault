const {test,expect}=require('bun:test');
const {movieDescription}=require('../movie-description.cjs');
test('movie descriptions retain their complete ending beyond the old 2000-character cap',()=>{
  const plot='A complete movie description. '.repeat(200)+'The final sentence.';
  expect(movieDescription({info:{plot}})).toBe(plot);
});
test('empty provider plot uses its full description on Windows and Mac',()=>{
  expect(movieDescription({info:{plot:'  ',description:'Full alternative description.'}})).toBe('Full alternative description.');
});
test('movie_data and top-level description fields are retained when info has no plot',()=>{
  expect(movieDescription({info:{plot:null},movie_data:{description:'Movie data description.'}})).toBe('Movie data description.');
  expect(movieDescription({description:'Top-level description.'})).toBe('Top-level description.');
  expect(movieDescription({info:{plot:'null',description:'undefined'}})).toBe('');
});