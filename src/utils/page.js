// Every list endpoint uses ?page and ?limit and returns this shape.
export function readPage(query) {
  const parsedPage = Number.parseInt(query.page, 10);
  const parsedLimit = Number.parseInt(query.limit, 10);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  let limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
  if (limit > 100) {
    limit = 100;
  }
  return { page, limit, skip: (page - 1) * limit };
}

export function pageData(items, total, page, limit) {
  return { items, total, page, limit };
}
