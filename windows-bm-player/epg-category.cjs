// Resolve only real catalogue categories. All/saved views never fan out to every country.
function categoryName(id,categories){if(id==='all'||id==='*')return null;const c=categories.find(c=>String(c.id)===String(id));return c&&typeof c.name==='string'&&/^[A-Za-z]{2,4}\s*\|/.test(c.name.trim())?c.name.trim():null;}
module.exports={categoryName};