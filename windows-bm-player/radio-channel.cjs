'use strict';

/** Provider radio categories/stations are audio-only even when their stream has no video track. */
function isRadio(item, categoryName) {
  const name = typeof item === 'string' ? item : item?.name;
  const category = typeof item === 'object' && item ? item.categoryName : categoryName;
  return /\bradio\b/i.test(String(`${name || ''} ${category || categoryName || ''}`).normalize('NFKC'));
}

function splitRadioChannels(data, radio) {
  const categories = Array.isArray(data?.categories) ? data.categories : [];
  const items = Array.isArray(data?.items) ? data.items : [];
  const names = new Map(categories.map(category => [String(category.id), category.name || '']));
  const matches = item => isRadio({ ...item, categoryName: item.categoryName || names.get(String(item.category)) || '' });
  const visibleItems = items.filter(item => matches(item) === radio);
  const ids = new Set(visibleItems.map(item => String(item.category)));
  return {
    ...data,
    categories: categories.filter(category => ids.has(String(category.id))),
    items: visibleItems,
  };
}

module.exports = { isRadio, splitRadioChannels };
