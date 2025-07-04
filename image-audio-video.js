const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const RESULT_DIR = path.join(__dirname, 'results');

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(RESULT_DIR)) fs.mkdirSync(RESULT_DIR);

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Static serving for created videos
app.use('/results', express.static(RESULT_DIR));
app.use(express.urlencoded({ extended: true }));

// Render HTML form
function renderForm(videoHtml = '') {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <title>Image to Video</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        padding: 30px;
        background: #f9f9f9;
      }
      nav {
        background: #333;
        padding: 10px 20px;
        margin: -30px -30px 20px -30px;
      }
      nav a {
        color: white;
        text-decoration: none;
        margin-right: 15px;
        font-weight: bold;
      }
      nav a:hover {
        text-decoration: underline;
      }
      form {
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 0 10px rgba(0,0,0,0.1);
        max-width: 500px;
        margin: auto;
      }
      h1, h2 {
        text-align: center;
        color: #333;
      }
      label {
        font-weight: bold;
        display: block;
        margin-top: 15px;
      }
      input, button {
        margin-top: 8px;
        width: 100%;
        padding: 10px;
        box-sizing: border-box;
        font-size: 16px;
      }
      button {
        background: #28a745;
        color: white;
        border: none;
        cursor: pointer;
        border-radius: 4px;
      }
      button:hover {
        background: #218838;
      }
      video {
        display: block;
        margin: 20px auto;
      }
      a.download-link {
        display: block;
        text-align: center;
        color: #007bff;
        font-weight: bold;
        margin-top: 10px;
      }
    </style>
  </head>
  <body>
    <h1>Create a Video from an Image</h1>
    <form action="/create" method="POST" enctype="multipart/form-data">
      <label>Select Image:</label>
      <input type="file" name="image" accept="image/*" required />

      <label>Video Duration (in seconds):</label>
      <input type="number" name="duration" min="1" required />

      <button type="submit">Create Video</button>
    </form>
    ${videoHtml}
  </body>
  </html>
  `;
}

// GET / - show form
app.get('/', (req, res) => {
  res.send(renderForm());
});

// POST /create - handle image to video creation
app.post('/create', upload.single('image'), (req, res) => {
  const imageFile = req.file?.path;
  const duration = parseInt(req.body.duration);

  if (!imageFile || isNaN(duration) || duration <= 0) {
    return res.status(400).send('Image and valid duration are required.');
  }

  const outputFileName = `video-${Date.now()}.mp4`;
  const outputPath = path.join(RESULT_DIR, outputFileName);

  ffmpeg()
    .input(imageFile)
    .inputOptions(['-loop 1'])
    .outputOptions([
      `-t ${duration}`,
      '-c:v libx264',
      '-preset veryfast',
      '-tune stillimage',
      '-pix_fmt yuv420p',
      '-movflags +faststart'
    ])
    .save(outputPath)
    .on('end', () => {
      fs.unlink(imageFile, () => {});
      const videoHtml = `
        <h2>Video Created!</h2>
        <video controls width="360">
          <source src="/results/${outputFileName}" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        <a class="download-link" href="/results/${outputFileName}" download>Download Video</a>
      `;
      res.send(renderForm(videoHtml));
    })
    .on('error', (err) => {
      console.error('FFmpeg error:', err);
      res.status(500).send('Error creating video.');
    });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
