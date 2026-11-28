'use strict';

/** Provider radio categories/stations are audio-only even when their stream has no video track. */
function isRadio(item, categoryName) {
  const name = typeof item === 'string' ? item : item?.name;
  const category = typeof item === 'object' && item ? item.categoryName : categoryName;
  return /\bradio\b/i.test(String(`${name || ''} ${category || categoryName || ''}`).normalize('NFKC'));
}

module.exports = { isRadio };
