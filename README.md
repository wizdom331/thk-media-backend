# THK.MEDIA — Backend

Express + SQLite backend for the THK.MEDIA store. Handles products, orders, and the admin dashboard.

---

## Quick Start (Local)

```bash
cd thk-backend
npm install
node server.js
```

Admin panel → http://localhost:3000/admin  
Default password → `thkadmin2024`  
Products API → http://localhost:3000/api/products

---

## Environment Setup

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Description |
|---|---|
| `PORT` | Server port (default 3000) |
| `JWT_SECRET` | Long random string — keep secret |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of your admin password |
| `ALLOWED_ORIGIN` | Your front-end URL e.g. `https://thk.media` |

### Generate a password hash

```bash
node -e "console.log(require('bcryptjs').hashSync('YOUR_PASSWORD', 12))"
```

Paste the output as `ADMIN_PASSWORD_HASH` in `.env`.

---

## Connecting the Front-End

In `thk-media-website.html`, find the `CONFIG` block and update:

```js
api: {
  url: 'https://your-backend-url.com',  // ← your deployed backend URL
  enabled: true,                         // ← set to true
}
```

The main site will then fetch live products from the API instead of using the hardcoded list.

---

## Deploy on Railway (free tier)

1. Push this folder to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo
4. Add environment variables from your `.env` in the Railway dashboard
5. Railway gives you a public URL — paste it as `ALLOWED_ORIGIN`

## Deploy on Render (free tier)

1. Push to GitHub
2. [render.com](https://render.com) → New → Web Service
3. Build Command: `npm install`
4. Start Command: `node server.js`
5. Add env vars in the Render dashboard

---

## API Reference

### Public (no auth)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/products` | All active products |
| `GET` | `/api/products/:id` | Single product |
| `POST` | `/api/orders` | Submit an order from checkout |
| `GET` | `/health` | Health check |

### Admin (Bearer token required)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login → returns JWT |
| `POST` | `/api/auth/change-password` | Generate new password hash |
| `GET` | `/api/products/all` | All products including hidden |
| `POST` | `/api/products` | Add product |
| `PUT` | `/api/products/:id` | Update product |
| `PATCH` | `/api/products/:id/toggle` | Toggle active/hidden |
| `DELETE` | `/api/products/:id` | Soft-delete product |
| `GET` | `/api/orders` | List orders (filter by `?status=pending`) |
| `GET` | `/api/orders/:id` | Order detail |
| `PUT` | `/api/orders/:id/status` | Update order status |
| `GET` | `/api/stats` | Dashboard stats |
| `GET` | `/api/settings` | Store settings |
| `PUT` | `/api/settings` | Update store settings |
| `GET` | `/admin` | Admin dashboard UI |

### Order Status Flow

```
pending → payment_received → processing → shipped → fulfilled
                                                   ↘ cancelled
```

---

## File Structure

```
thk-backend/
├── server.js        Main server (all routes)
├── admin.html       Admin dashboard SPA
├── package.json
├── .env.example     Copy to .env and fill in
├── README.md        This file
└── thk.db           SQLite database (auto-created on first run)
```

---

## Default Admin Credentials

| Field | Value |
|---|---|
| URL | `/admin` |
| Password | `thkadmin2024` |

**Change this before going live** using Settings → Change Password in the dashboard.
