// ═══════════════════════════════════════════════════════════════════
// THK.MEDIA — Backend Server
// Express + SQLite  |  Products · Orders · Admin API
// ═══════════════════════════════════════════════════════════════════
require('dotenv').config();
const express  = require('express');
const Database = require('better-sqlite3');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const cors     = require('cors');
const path     = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'thk-dev-secret-CHANGE-IN-PRODUCTION';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// ── Middleware ────────────────────────────────────────────────────
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(express.json());

// ── Database ─────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'thk.db'));
db.pragma('journal_mode = WAL'); // better concurrent performance

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    category    TEXT    NOT NULL DEFAULT 'apparel',
    price_usd   REAL    NOT NULL,
    badge       TEXT    DEFAULT '',
    description TEXT    DEFAULT '',
    art_code    TEXT    DEFAULT 'THK',
    active      INTEGER DEFAULT 1,
    sort_order  INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    order_ref        TEXT    UNIQUE NOT NULL,
    customer_name    TEXT    NOT NULL,
    customer_email   TEXT    NOT NULL,
    customer_phone   TEXT    NOT NULL,
    delivery_address TEXT    NOT NULL,
    delivery_city    TEXT    DEFAULT '',
    delivery_province TEXT   DEFAULT '',
    order_notes      TEXT    DEFAULT '',
    items_json       TEXT    NOT NULL,
    total_usd        REAL    NOT NULL,
    payment_method   TEXT    NOT NULL,
    status           TEXT    DEFAULT 'pending',
    created_at       TEXT    DEFAULT CURRENT_TIMESTAMP,
    updated_at       TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ── Seed default products if DB is empty ─────────────────────────
const count = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
if (count === 0) {
  const ins = db.prepare(`
    INSERT INTO products (name, category, price_usd, badge, description, art_code, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['Void Jacket',          'apparel',  180, 'New',        'Deconstructed oversized jacket in reclaimed cotton with raw-edge detailing and asymmetric collar.',           'VJ', 1],
    ['Reclaimed Cargo',      'upcycled', 140, 'Limited',    'One-of-one upcycled cargo trousers sourced from discarded military surplus. No two are identical.',           'RC', 2],
    ['Void Hoodie',          'merch',     95, '',           'Premium heavyweight fleece with THK.MEDIA wordmark. Garment-dyed in raw iron oxide.',                         'VH', 3],
    ['Spirit Wrap',          'upcycled', 220, '1/1',        'Statement wrap piece from reclaimed kente offcuts and industrial canvas. Hand-stitched.',                     'SW', 4],
    ['Fragment Tee',         'merch',     60, '',           '100% organic cotton with distressed THK. logo screenprint. Boxy silhouette.',                                 'FT', 5],
    ['Hollow Sculpture No.3','art',      480, 'Collectible','Multimedia sculpture in found metal and reclaimed fabric. Explores duality of absence and presence.',         'HS', 6],
    ['Exile Coat',           'apparel',  340, 'Limited',    'Long-form structured coat with architectural shoulder construction. Undyed natural wool.',                    'EC', 7],
    ['Thread Relic No.1',    'art',      260, 'Collectible','Wall-mounted textile installation using reclaimed thread and raw canvas. Signed edition.',                    'TR', 8],
    ['Drift Shirt',          'apparel',  110, '',           'Organic oversized shirt with frayed hem and minimal THK. chest logo. Unisex silhouette.',                    'DS', 9],
  ].forEach(row => ins.run(...row));
  console.log('✓ Seeded 9 default products');
}

// ── Seed default settings ─────────────────────────────────────────
const defaultSettings = {
  store_email:    'orders@thk.media',
  ecocash_number: '07X XXX XXXX',
  bank_name:      'CBZ Bank',
  bank_account:   '',
  bank_branch:    'Harare',
  store_whatsapp: '263XXXXXXXXX',
};
const setSet = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
Object.entries(defaultSettings).forEach(([k, v]) => setSet.run(k, v));

// ── Auth middleware ───────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.admin = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalid or expired' });
  }
}

// ═══════════════════════════════════════════════════════════════════
// ROUTES — AUTH
// ═══════════════════════════════════════════════════════════════════

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) {
    // Dev mode — use default password 'thkadmin2024'
    if (password !== 'thkadmin2024') {
      return res.status(401).json({ error: 'Invalid password' });
    }
  } else {
    if (!bcrypt.compareSync(password, hash)) {
      return res.status(401).json({ error: 'Invalid password' });
    }
  }
  const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, expiresIn: '7d' });
});

// POST /api/auth/change-password  (admin only)
app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const hash = bcrypt.hashSync(newPassword, 12);
  console.log('\n⚠️  New password hash (add to .env as ADMIN_PASSWORD_HASH):\n', hash, '\n');
  res.json({ ok: true, hash, note: 'Save this hash as ADMIN_PASSWORD_HASH in your .env file' });
});

// ═══════════════════════════════════════════════════════════════════
// ROUTES — PRODUCTS
// ═══════════════════════════════════════════════════════════════════

// GET /api/products  (public — main site fetches this)
app.get('/api/products', (req, res) => {
  const products = db.prepare(
    'SELECT * FROM products WHERE active = 1 ORDER BY sort_order ASC, id ASC'
  ).all();
  res.json(products);
});

// GET /api/products/all  (admin — includes inactive)
app.get('/api/products/all', requireAuth, (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY sort_order ASC, id ASC').all();
  res.json(products);
});

// GET /api/products/:id
app.get('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

// POST /api/products  (admin)
app.post('/api/products', requireAuth, (req, res) => {
  const { name, category, price_usd, badge, description, art_code, sort_order } = req.body;
  if (!name || !category || price_usd == null) {
    return res.status(400).json({ error: 'name, category, and price_usd are required' });
  }
  const result = db.prepare(`
    INSERT INTO products (name, category, price_usd, badge, description, art_code, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, category, parseFloat(price_usd), badge || '', description || '', art_code || 'THK', sort_order || 99);
  res.status(201).json({ id: result.lastInsertRowid, ok: true });
});

// PUT /api/products/:id  (admin)
app.put('/api/products/:id', requireAuth, (req, res) => {
  const { name, category, price_usd, badge, description, art_code, active, sort_order } = req.body;
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare(`
    UPDATE products
    SET name=?, category=?, price_usd=?, badge=?, description=?, art_code=?,
        active=?, sort_order=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(name, category, parseFloat(price_usd), badge || '', description || '', art_code || 'THK',
         active ?? 1, sort_order ?? 0, req.params.id);
  res.json({ ok: true });
});

// PATCH /api/products/:id/toggle  (admin — quick active toggle)
app.patch('/api/products/:id/toggle', requireAuth, (req, res) => {
  const p = db.prepare('SELECT active FROM products WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE products SET active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(p.active ? 0 : 1, req.params.id);
  res.json({ ok: true, active: !p.active });
});

// DELETE /api/products/:id  (admin — soft delete)
app.delete('/api/products/:id', requireAuth, (req, res) => {
  db.prepare('UPDATE products SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(req.params.id);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// ROUTES — ORDERS
// ═══════════════════════════════════════════════════════════════════

// POST /api/orders  (public — called from checkout)
app.post('/api/orders', (req, res) => {
  const {
    order_ref, customer_name, customer_email, customer_phone,
    delivery_address, delivery_city, delivery_province, order_notes,
    items, total_usd, payment_method
  } = req.body;

  if (!order_ref || !customer_name || !customer_email || !items || !total_usd) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    db.prepare(`
      INSERT INTO orders
        (order_ref, customer_name, customer_email, customer_phone,
         delivery_address, delivery_city, delivery_province, order_notes,
         items_json, total_usd, payment_method)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      order_ref, customer_name, customer_email, customer_phone || '',
      delivery_address, delivery_city || '', delivery_province || '', order_notes || '',
      JSON.stringify(items), parseFloat(total_usd), payment_method
    );
    res.status(201).json({ ok: true, ref: order_ref });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Order reference already exists' });
    }
    console.error(e);
    res.status(500).json({ error: 'Failed to save order' });
  }
});

// GET /api/orders  (admin)
app.get('/api/orders', requireAuth, (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;
  let query = 'SELECT * FROM orders';
  const params = [];
  if (status && status !== 'all') {
    query += ' WHERE status = ?';
    params.push(status);
  }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  const orders = db.prepare(query).all(...params);
  const total  = db.prepare(status && status !== 'all'
    ? 'SELECT COUNT(*) as c FROM orders WHERE status=?' : 'SELECT COUNT(*) as c FROM orders')
    .get(...(status && status !== 'all' ? [status] : [])).c;
  res.json({ orders: orders.map(o => ({ ...o, items: JSON.parse(o.items_json) })), total });
});

// GET /api/orders/:id  (admin)
app.get('/api/orders/:id', requireAuth, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Not found' });
  res.json({ ...o, items: JSON.parse(o.items_json) });
});

// PUT /api/orders/:id/status  (admin)
app.put('/api/orders/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  const valid = ['pending', 'payment_received', 'processing', 'shipped', 'fulfilled', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE orders SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(status, req.params.id);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// ROUTES — SETTINGS
// ═══════════════════════════════════════════════════════════════════

// GET /api/settings  (admin)
app.get('/api/settings', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(settings);
});

// PUT /api/settings  (admin)
app.put('/api/settings', requireAuth, (req, res) => {
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const update = db.transaction(data => {
    Object.entries(data).forEach(([k, v]) => upsert.run(k, String(v)));
  });
  update(req.body);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// ROUTES — DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════════
app.get('/api/stats', requireAuth, (req, res) => {
  const totalProducts  = db.prepare('SELECT COUNT(*) as c FROM products WHERE active=1').get().c;
  const hiddenProducts = db.prepare('SELECT COUNT(*) as c FROM products WHERE active=0').get().c;
  const totalOrders    = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  const pendingOrders  = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status='pending'").get().c;
  const revenue        = db.prepare("SELECT COALESCE(SUM(total_usd),0) as r FROM orders WHERE status NOT IN ('cancelled')").get().r;
  const recentOrders   = db.prepare('SELECT order_ref, customer_name, total_usd, status, created_at FROM orders ORDER BY created_at DESC LIMIT 5').all();
  res.json({ totalProducts, hiddenProducts, totalOrders, pendingOrders, revenue, recentOrders });
});

// ── Serve admin dashboard ─────────────────────────────────────────
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// ── Health check ──────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, service: 'THK.MEDIA Backend', version: '1.0.0' }));

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ████████╗██╗  ██╗██╗  ██╗`);
  console.log(`  ╚══██╔══╝██║  ██║██║ ██╔╝`);
  console.log(`     ██║   ███████║█████╔╝ `);
  console.log(`     ██║   ██╔══██║██╔═██╗ `);
  console.log(`     ██║   ██║  ██║██║  ██╗`);
  console.log(`     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝  .MEDIA\n`);
  console.log(`  Backend running at http://localhost:${PORT}`);
  console.log(`  Admin panel:       http://localhost:${PORT}/admin`);
  console.log(`  Products API:      http://localhost:${PORT}/api/products`);
  if (!process.env.ADMIN_PASSWORD_HASH) {
    console.log(`\n  ⚠️  Dev mode — default password: thkadmin2024`);
    console.log(`  Set ADMIN_PASSWORD_HASH in .env before going live\n`);
  }
});
