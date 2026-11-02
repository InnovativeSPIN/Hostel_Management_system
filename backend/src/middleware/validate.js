// Validates req.body / req.query / req.params with a zod schema.
// Parsed values are stored on req.body (body) or req.valid[source].
const validate = (schema, source = 'body') => (req, _res, next) => {
  const parsed = schema.parse(req[source] ?? {});
  if (source === 'body') req.body = parsed;
  req.valid = { ...(req.valid || {}), [source]: parsed };
  next();
};

module.exports = { validate };
