const ok = (res, data, meta, status = 200) => res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
const created = (res, data) => ok(res, data, undefined, 201);
const paged = (res, { data, meta }) => ok(res, data, meta);

module.exports = { ok, created, paged };
