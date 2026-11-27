/** Provider descriptions are text, not markup, and must never be length-capped. */
function descriptionText(value){
  if(typeof value!=='string')return '';
  const text=value.trim();
  return /^(null|undefined)$/i.test(text)?'':text;
}
function movieDescription(response){
  for(const source of [response?.info,response?.movie_data,response]){
    for(const key of ['plot','description']){
      const text=descriptionText(source?.[key]);
      if(text)return text;
    }
  }
  return '';
}
module.exports={movieDescription};