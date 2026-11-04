// Sort a copy so changing the Library view never reorders cached creator media.
export function sortLibraryItems(items, sort) {
  const list = [...items];
  const dateOf = x => new Date(x.publishedAt || x.createdAt || 0).getTime() || 0;
  const viewsOf = x => Number(x.viewCount || 0);
  if (sort === 'oldest') return list.sort((a, b) => dateOf(a) - dateOf(b));
  if (sort === 'views-desc') return list.sort((a, b) => viewsOf(b) - viewsOf(a));
  if (sort === 'views-asc') return list.sort((a, b) => viewsOf(a) - viewsOf(b));
  return list.sort((a, b) => dateOf(b) - dateOf(a));
}
