const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

// Ensure necessary folders exist
['uploads', 'trimmed'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Middleware
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/trimmed', express.static(path.join(__dirname, 'trimmed')));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// Utilities
function getMediaDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration);
    });
  });
}

function toTimeFormat(seconds) {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String((seconds % 60).toFixed(1)).padStart(4, '0');
  return `${h}:${m}:${s}`;
}

const toSec = (t) => {
  const [h, m, s] = t.split(':');
  return (+h) * 3600 + (+m) * 60 + parseFloat(s);
};

// Serve HTML interface
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Audio Trimmer</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 2rem auto;
      max-width: 700px;
      background: #f9f9f9;
      padding: 2rem;
      border-radius: 10px;
      box-shadow: 0 0 12px rgba(0, 0, 0, 0.1);
    }
    h2 { color: #333; }
    form, label, button { margin-top: 1rem; }
    label { display: block; margin-top: 10px; }
    input[type="file"], input[type="text"] {
      padding: 6px;
      width: 100%;
      max-width: 250px;
      margin-top: 5px;
      box-sizing: border-box;
    }
    button {
      padding: 8px 16px;
      background: #28a745;
      color: white;
      border: none;
      border-radius: 4px;
      margin-top: 10px;
      cursor: pointer;
    }
    button:hover { background: #218838; }
    audio { margin-top: 1rem; width: 100%; }
    #trimControls, #trimmedPlayer, #downloadArea { margin-top: 20px; }
  </style>
</head>
<body>
  <h2>Upload Audio/Video File</h2>
  <form id="uploadForm" enctype="multipart/form-data">
    <input type="file" name="file" required />
    <button type="submit">Upload</button>
  </form>

  <div id="trimControls" style="display:none;">
    <label>Start Time: <input type="text" id="start" value="00:00:00.0" /></label>
    <label>End Time: <input type="text" id="end" value="00:00:00.0" /></label>
    <button id="trimButton" style="display:none;">Trim</button>
  </div>

  <div id="trimmedPlayer" style="display:none;"></div>
  <div id="downloadArea" style="display:none;"></div>

  <script>
    const uploadForm = document.getElementById('uploadForm');
    const trimControls = document.getElementById('trimControls');
    const trimmedPlayer = document.getElementById('trimmedPlayer');
    const downloadArea = document.getElementById('downloadArea');
    const startInput = document.getElementById('start');
    const endInput = document.getElementById('end');
    const trimButton = document.getElementById('trimButton');

    let filePath = '';

    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(uploadForm);
      const response = await fetch('/upload', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      filePath = data.path;

      trimControls.style.display = 'block';
      startInput.value = '00:00:00.0';
      endInput.value = data.duration;

      trimButton.style.display = 'none';
      trimmedPlayer.style.display = 'none';
      downloadArea.style.display = 'none';
    });

    startInput.addEventListener('input', () => trimButton.style.display = 'inline-block');
    endInput.addEventListener('input', () => trimButton.style.display = 'inline-block');

    trimButton.addEventListener('click', async () => {
      const start = startInput.value;
      const end = endInput.value;

      const res = await fetch('/trim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end, filePath })
      });

      const data = await res.json();

      if (data.trimmed) {
        trimmedPlayer.innerHTML = \`
          <h3>Trimmed Preview</h3>
          <audio controls src="\${data.trimmed}"></audio>
        \`;
        trimmedPlayer.style.display = 'block';

        downloadArea.innerHTML = \`
          <a href="\${data.trimmed}" download><button>Download Trimmed MP3</button></a>
        \`;
        downloadArea.style.display = 'block';
      }
    });
  </script>
</body>
</html>`);
});

// Upload Endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  const inputPath = req.file.path;
  const convertedPath = path.join('uploads', `converted-${Date.now()}.mp3`);

  ffmpeg(inputPath)
    .audioCodec('libmp3lame')
    .audioBitrate('320k')
    .audioChannels(2)
    .audioFrequency(44100)
    .on('end', async () => {
      fs.unlink(inputPath, () => {});
      const duration = await getMediaDuration(convertedPath);
      res.json({
        path: '/' + convertedPath.replace(/\\/g, '/'),
        duration: toTimeFormat(duration)
      });
    })
    .on('error', (err) => {
      console.error('Conversion error:', err);
      res.status(500).json({ error: 'Conversion failed' });
    })
    .save(convertedPath);
});

// Trim Endpoint
app.post('/trim', async (req, res) => {
  const { start, end, filePath } = req.body;
  if (!start || !end || !filePath) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const inputPath = path.join(__dirname, filePath);
  const trimmedFile = `trimmed-${Date.now()}.mp3`;
  const trimmedPath = path.join(__dirname, 'trimmed', trimmedFile);

  const duration = (toSec(end) - toSec(start)).toFixed(2);
  if (duration <= 0) {
    return res.status(400).json({ error: 'Invalid duration' });
  }

  ffmpeg(inputPath)
    .setStartTime(start)
    .duration(duration)
    .on('end', () => {
      res.json({ trimmed: '/trimmed/' + trimmedFile });
    })
    .on('error', err => {
      console.error('Trimming error:', err);
      res.status(500).json({ error: 'Trimming failed' });
    })
    .save(trimmedPath);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
