export function isObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ''));
}

export function idString(value) {
  if (!value) return null;
  if (value._id) return value._id.toString();
  return value.toString();
}
