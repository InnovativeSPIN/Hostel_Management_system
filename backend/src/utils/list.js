// Shared pagination / sorting / filtering helpers for list endpoints.
const { z } = require('zod');

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
  search: z.string().trim().max(100).optional(),
  sort: z.string().max(40).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).passthrough();

function parseList(rawQuery, { sortable, defaultSort, defaultOrder = 'desc' }) {
  const q = listQuery.parse(rawQuery);
  const sortCol = sortable[q.sort] || sortable[defaultSort] || Object.values(sortable)[0];
  const dir = (q.order || defaultOrder) === 'asc' ? 'ASC' : 'DESC';
  return {
    ...q,
    offset: (q.page - 1) * q.limit,
    // Split on commas outside parentheses so expressions like FIELD(a,'x','y') stay intact.
    orderBy: sortCol.split(/,(?![^(]*\))/).map((c) => `${c.trim()} ${dir}`).join(', '),
  };
}

class Where {
  constructor() { this.parts = []; this.params = []; }
  add(sql, ...params) { this.parts.push(sql); this.params.push(...params); return this; }
  addIf(cond, sql, ...params) { if (cond !== undefined && cond !== null && cond !== '') this.add(sql, ...params); return this; }
  search(term, columns) {
    if (!term) return this;
    const like = `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    this.parts.push(`(${columns.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    columns.forEach(() => this.params.push(like));
    return this;
  }
  get sql() { return this.parts.length ? `WHERE ${this.parts.join(' AND ')}` : ''; }
}

async function paginate(db, { select, from, where, orderBy, limit, offset, page }) {
  const [rows, countRow] = await Promise.all([
    db.query(`SELECT ${select} ${from} ${where.sql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...where.params, limit, offset]),
    db.one(`SELECT COUNT(*) AS total ${from} ${where.sql}`, where.params),
  ]);
  return { data: rows, meta: { page, limit, total: countRow.total, pages: Math.ceil(countRow.total / limit) } };
}

module.exports = { parseList, Where, paginate };
