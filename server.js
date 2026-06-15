// ═══════════════════════════════════════════════════════════════════
// THK.MEDIA — Backend Server (sqlite3 version)
// Express + sqlite3 (callback-based)  |  Products · Orders · Admin API
// ═══════════════════════════════════════════════════════════════════
require('dotenv').config();
const express  = require('express');
const sqlite3  = require('sqlite3').verbose();
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const cors     = require('cors');
const path     = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'thk-dev-secret-CHANGE-IN-PRODUCTION';
// ── Middleware ────────────────────────────────────────────────────
// Manual CORS — avoids the credentials:true + origin:* conflict that
// causes browsers to silently block cross-origin requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json());

// ── Database ──────────────────────────────────────────────────────
const db = new sqlite3.Database(path.join(__dirname, 'thk.db'), (err) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }
  console.log('✓ Connected to SQLite database');
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Initialize database schema
db.serialize(() => {
  db.run(`
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
    )
  `);

  db.run(`
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
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Check if products table is empty and seed defaults
  db.get('SELECT COUNT(*) as c FROM products', (err, row) => {
    if (!err && row.c === 0) {
      const stmt = db.prepare(`
        INSERT INTO products (name, category, price_usd, badge, description, art_code, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const products = [
        ['Void Jacket',          'apparel',  180, 'New',        'Deconstructed oversized jacket in reclaimed cotton with raw-edge detailing and asymmetric collar.',           'VJ', 1],
        ['Reclaimed Cargo',      'upcycled', 140, 'Limited',    'One-of-one upcycled cargo trousers sourced from discarded military surplus. No two are identical.',           'RC', 2],
        ['Void Hoodie',          'merch',     95, '',           'Premium heavyweight fleece with THK.MEDIA wordmark. Garment-dyed in raw iron oxide.',                         'VH', 3],
        ['Spirit Wrap',          'upcycled', 220, '1/1',        'Statement wrap piece from reclaimed kente offcuts and industrial canvas. Hand-stitched.',                     'SW', 4],
        ['Fragment Tee',         'merch',     60, '',           '100% organic cotton with distressed THK. logo screenprint. Boxy silhouette.',                                 'FT', 5],
        ['Hollow Sculpture No.3','art',      480, 'Collectible','Multimedia sculpture in found metal and reclaimed fabric. Explores duality of absence and presence.',         'HS', 6],
        ['Exile Coat',           'apparel',  340, 'Limited',    'Long-form structured coat with architectural shoulder construction. Undyed natural wool.',                    'EC', 7],
        ['Thread Relic No.1',    'art',      260, 'Collectible','Wall-mounted textile installation using reclaimed thread and raw canvas. Signed edition.',                    'TR', 8],
        ['Drift Shirt',          'apparel',  110, '',           'Organic oversized shirt with frayed hem and minimal THK. chest logo. Unisex silhouette.',                    'DS', 9],
      ];
      products.forEach(p => stmt.run(...p));
      stmt.finalize();
      console.log('✓ Seeded 9 default products');
    }
  });

  // Seed default settings
  const settings = [
    ['store_email',    'orders@thk.media'],
    ['ecocash_number', '07X XXX XXXX'],
    ['bank_name',      'CBZ Bank'],
    ['bank_account',   ''],
    ['bank_branch',    'Harare'],
    ['store_whatsapp', '263XXXXXXXXX'],
  ];
  const setStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  settings.forEach(s => setStmt.run(...s));
  setStmt.finalize();
});

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

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) {
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

app.get('/api/products', (req, res) => {
  db.all(
    'SELECT * FROM products WHERE active = 1 ORDER BY sort_order ASC, id ASC',
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

app.get('/api/products/all', requireAuth, (req, res) => {
  db.all(
    'SELECT * FROM products ORDER BY sort_order ASC, id ASC',
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

app.get('/api/products/:id', (req, res) => {
  db.get(
    'SELECT * FROM products WHERE id = ?',
    [req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    }
  );
});

app.post('/api/products', requireAuth, (req, res) => {
  const { name, category, price_usd, badge, description, art_code, sort_order } = req.body;
  if (!name || !category || price_usd == null) {
    return res.status(400).json({ error: 'name, category, and price_usd are required' });
  }
  db.run(
    `INSERT INTO products (name, category, price_usd, badge, description, art_code, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, category, parseFloat(price_usd), badge || '', description || '', art_code || 'THK', sort_order || 99],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, ok: true });
    }
  );
});

app.put('/api/products/:id', requireAuth, (req, res) => {
  const { name, category, price_usd, badge, description, art_code, active, sort_order } = req.body;
  db.run(
    `UPDATE products
     SET name=?, category=?, price_usd=?, badge=?, description=?, art_code=?,
         active=?, sort_order=?, updated_at=CURRENT_TIMESTAMP
     WHERE id=?`,
    [name, category, parseFloat(price_usd), badge || '', description || '', art_code || 'THK',
     active ?? 1, sort_order ?? 0, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    }
  );
});

app.patch('/api/products/:id/toggle', requireAuth, (req, res) => {
  db.get(
    'SELECT active FROM products WHERE id=?',
    [req.params.id],
    (err, p) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!p) return res.status(404).json({ error: 'Not found' });
      db.run(
        'UPDATE products SET active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
        [p.active ? 0 : 1, req.params.id],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ ok: true, active: !p.active });
        }
      );
    }
  );
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
  db.run(
    'UPDATE products SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?',
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    }
  );
});

// ═══════════════════════════════════════════════════════════════════
// ROUTES — ORDERS
// ═══════════════════════════════════════════════════════════════════

app.post('/api/orders', (req, res) => {
  const {
    order_ref, customer_name, customer_email, customer_phone,
    delivery_address, delivery_city, delivery_province, order_notes,
    items, total_usd, payment_method
  } = req.body;

  if (!order_ref || !customer_name || !customer_email || !items || !total_usd) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  db.run(
    `INSERT INTO orders
      (order_ref, customer_name, customer_email, customer_phone,
       delivery_address, delivery_city, delivery_province, order_notes,
       items_json, total_usd, payment_method)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [order_ref, customer_name, customer_email, customer_phone || '',
     delivery_address, delivery_city || '', delivery_province || '', order_notes || '',
     JSON.stringify(items), parseFloat(total_usd), payment_method],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(409).json({ error: 'Order reference already exists' });
        }
        console.error(err);
        return res.status(500).json({ error: 'Failed to save order' });
      }
      res.status(201).json({ ok: true, ref: order_ref });
    }
  );
});

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

  db.all(query, params, (err, orders) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const countQuery = status && status !== 'all'
      ? 'SELECT COUNT(*) as c FROM orders WHERE status=?'
      : 'SELECT COUNT(*) as c FROM orders';
    const countParams = status && status !== 'all' ? [status] : [];
    
    db.get(countQuery, countParams, (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        orders: (orders || []).map(o => ({ ...o, items: JSON.parse(o.items_json) })),
        total: result.c
      });
    });
  });
});

app.get('/api/orders/:id', requireAuth, (req, res) => {
  db.get(
    'SELECT * FROM orders WHERE id=?',
    [req.params.id],
    (err, o) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!o) return res.status(404).json({ error: 'Not found' });
      res.json({ ...o, items: JSON.parse(o.items_json) });
    }
  );
});

app.put('/api/orders/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  const valid = ['pending', 'payment_received', 'processing', 'shipped', 'fulfilled', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  
  db.run(
    'UPDATE orders SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
    [status, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    }
  );
});

// ═══════════════════════════════════════════════════════════════════
// ROUTES — SETTINGS
// ═══════════════════════════════════════════════════════════════════

app.get('/api/settings', requireAuth, (req, res) => {
  db.all('SELECT key, value FROM settings', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const settings = Object.fromEntries((rows || []).map(r => [r.key, r.value]));
    res.json(settings);
  });
});

app.put('/api/settings', requireAuth, (req, res) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  Object.entries(req.body).forEach(([k, v]) => {
    stmt.run(k, String(v));
  });
  stmt.finalize((err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

// ═══════════════════════════════════════════════════════════════════
// ROUTES — DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════════
app.get('/api/stats', requireAuth, (req, res) => {
  db.get('SELECT COUNT(*) as c FROM products WHERE active=1', (err, r1) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT COUNT(*) as c FROM products WHERE active=0', (err, r2) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT COUNT(*) as c FROM orders', (err, r3) => {
        if (err) return res.status(500).json({ error: err.message });
        db.get("SELECT COUNT(*) as c FROM orders WHERE status='pending'", (err, r4) => {
          if (err) return res.status(500).json({ error: err.message });
          db.get("SELECT COALESCE(SUM(total_usd),0) as r FROM orders WHERE status NOT IN ('cancelled')", (err, r5) => {
            if (err) return res.status(500).json({ error: err.message });
            db.all('SELECT order_ref, customer_name, total_usd, status, created_at FROM orders ORDER BY created_at DESC LIMIT 5', (err, recent) => {
              if (err) return res.status(500).json({ error: err.message });
              res.json({
                totalProducts: r1.c,
                hiddenProducts: r2.c,
                totalOrders: r3.c,
                pendingOrders: r4.c,
                revenue: r5.r,
                recentOrders: recent || []
              });
            });
          });
        });
      });
    });
  });
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
