const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
require('./database'); // initialise & seed DB on startup

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/admin',    require('./routes/numerology'));
app.use('/api/admin',    require('./routes/candidateAnalyze'));
app.use('/api/employee', require('./routes/employee'));

const distDir = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n  Scorecard backend running \u2192 http://localhost:${PORT}`);
  console.log('  Admin     :  test123  / 12345');
  console.log('  Employees :  hkhan    / 12345');
  console.log('              abigail   / 12345');
  console.log('              (see database.js for all)\n');
});