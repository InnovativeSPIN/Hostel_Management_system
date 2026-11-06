const path = require('path');
const express = require(path.join(__dirname, '../backend/node_modules/express'));
const { upload, checkUploads } = require('../backend/src/middleware/upload');
const app = express();
app.use(express.json());
app.post('/test', upload.fields([{ name: 'images', maxCount: 3 }]), checkUploads, (req, res) => {
  res.json({ ok: true, body: req.body, files: req.files });
});
const server = app.listen(0, async () => {
  const port = server.address().port;
  const res = await fetch('http://127.0.0.1:' + port + '/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Test Title', category: 'electrical' })
  });
  const data = await res.json();
  console.log('JSON request result:', data);
  server.close();
});
