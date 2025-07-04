const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Middleware
app.use('/results', express.static(RESULT_DIR));
app.use(express.urlencoded({ extended: true }));

// Render HTML Form
function renderForm(videoHtml = '') {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Replace Video Audio</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        background: #f4f4f4;
        margin: 0;
        padding: 0;
      }
      nav {
        background: #333;
        color: white;
        padding: 10px 20px;
      }
      nav a {
        color: white;
        text-decoration: none;
        margin-right: 20px;
        font-weight: bold;
      }
      nav a:hover {
        text-decoration: underline;
      }
      .container {
        max-width: 800px;
        margin: 30px auto;
        background: white;
        padding: 30px;
        box-shadow: 0 0 10px rgba(0,0,0,0.1);
        border-radius: 8px;
      }
      h1 {
        text-align: center;
        color: #333;
      }
      label {
        display: block;
        margin-top: 15px;
        font-weight: bold;
      }
      input[type="file"] {
        margin-top: 5px;
      }
      button {
        margin-top: 20px;
        padding: 10px 20px;
        background: #007BFF;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
      }
      button:hover {
        background: #0056b3;
      }
      video {
        display: block;
        margin: 20px auto;
        border-radius: 6px;
      }
      a.download-link {
        display: inline-block;
        margin-top: 10px;
        text-align: center;
        color: #007BFF;
        font-weight: bold;
      }
      a.download-link:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <nav>
      <a href="/">Replace Audio</a>
      <a href="/image-to-video">Image to Video</a>
      <a href="/merge-audio-video">Merge Audio & Video</a>
    </nav>
    <div class="container">
      <h1>Replace Video's Audio with Your Own</h1>
      <form action="/" method="POST" enctype="multipart/form-data">
        <label>Upload Video File:</label>
        <input type="file" name="video" accept="video/*" required />

        <label>Upload Audio File:</label>
        <input type="file" name="audio" accept="audio/*" required />

        <button type="submit">Replace Audio</button>
      </form>
      ${videoHtml}
    </div>
  </body>
  </html>
  `;
}

// GET / - Render form
app.get('/', (req, res) => {
  res.send(renderForm());
});

// POST / - Process video/audio replacement
app.post('/', upload.fields([{ name: 'video' }, { name: 'audio' }]), (req, res) => {
  const videoFile = req.files?.video?.[0]?.path;
  const audioFile = req.files?.audio?.[0]?.path;

  if (!videoFile || !audioFile) {
    return res.status(400).send('Both video and audio files are required.');
  }

  const outputFileName = `replaced-${Date.now()}.mp4`;
  const outputPath = path.join(RESULT_DIR, outputFileName);

  ffmpeg()
    .input(videoFile)
    .input(audioFile)
    .outputOptions([
      '-map 0:v:0',
      '-map 1:a:0',
      '-c:v copy',
      '-shortest'
    ])
    .save(outputPath)
    .on('end', () => {
      fs.unlink(videoFile, () => {});
      fs.unlink(audioFile, () => {});

      const videoHtml = `
        <h2>Video Created with New Audio!</h2>
        <video controls width="480">
          <source src="/results/${outputFileName}" type="video/mp4" />
          Your browser does not support the video tag.
        </video><br/>
        <a href="/results/${outputFileName}" download class="download-link">Download Video</a>
      `;
      res.send(renderForm(videoHtml));
    })
    .on('error', (err) => {
      console.error('FFmpeg error:', err);
      res.status(500).send('Error processing video.');
    });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
