const express = require('express');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate, requireRole('admin'));

router.get('/numerology-weights', (req, res) => {
  try {
    const row = db.prepare('SELECT value FROM org_settings WHERE key = ?').get('numerology_weights');
    if (row) return res.json(JSON.parse(row.value));
  } catch (e) {}
  if (process.env.NUMEROLOGY_WEIGHTS) {
    try { return res.json(JSON.parse(process.env.NUMEROLOGY_WEIGHTS)); } catch (e) {}
  }
  res.json({ dob: 0.7, name: 0.3 });
});

router.put('/numerology-weights', (req, res) => {
  const { dob, name } = req.body;
  const d = Number(dob);
  const n = Number(name);
  if (!(d >= 0 && d <= 1 && n >= 0 && n <= 1) || Math.abs(d + n - 1) > 0.001) {
    return res.status(400).json({ error: 'dob and name must be 0-1 and sum to 1 (e.g., 0.7 and 0.3)' });
  }
  const value = JSON.stringify({ dob: d, name: n });
  db.prepare('INSERT INTO org_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime(\'now\')').run('numerology_weights', value);
  res.json({ dob: d, name: n });
});

module.exports = router;
