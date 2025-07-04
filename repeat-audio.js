const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

ffmpeg.setFfmpegPath(ffmpegPath);

// Setup Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

// Serve homepage
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Audio Repeater</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: #f5f7fa;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .container {
          background: white;
          padding: 30px 40px;
          border-radius: 10px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
          width: 100%;
          max-width: 450px;
          text-align: center;
        }
        h2 {
          margin-bottom: 20px;
          color: #333;
        }
        input[type="file"],
        input[type="number"] {
          margin-bottom: 15px;
          width: 100%;
          padding: 10px;
          font-size: 16px;
          border: 1px solid #ccc;
          border-radius: 6px;
        }
        button {
          background-color: #4a90e2;
          color: white;
          padding: 10px 20px;
          border: none;
          font-size: 16px;
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.3s ease;
        }
        button:hover {
          background-color: #357ab8;
        }
        #result {
          margin-top: 20px;
        }
        audio {
          width: 100%;
          margin-top: 10px;
        }
        a {
          display: inline-block;
          margin-top: 10px;
          color: #4a90e2;
          text-decoration: none;
        }
        a:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Audio Repeater</h2>
        <form id="uploadForm" enctype="multipart/form-data">
          <input type="file" name="audio" accept="audio/*" required />
          <input type="number" name="repeatCount" min="1" max="100" placeholder="Repeat count" required />
          <button type="submit">Upload & Repeat</button>
        </form>

        <div id="result"></div>
      </div>

      <script>
        const form = document.getElementById('uploadForm');
        form.addEventListener('submit', async e => {
          e.preventDefault();
          const formData = new FormData(form);
          const res = await fetch('/process', {
            method: 'POST',
            body: formData,
          });
          if (!res.ok) {
            alert('Error processing audio');
            return;
          }
          const data = await res.json();
          const audioUrl = data.audioUrl;
          document.getElementById('result').innerHTML = \`
            <p><strong>Repeated Audio:</strong></p>
            <audio controls src="\${audioUrl}"></audio><br>
            <a href="\${audioUrl}" download="repeated-audio.mp3">⬇️ Download Audio</a>
          \`;
        });
      </script>
    </body>
    </html>
  `);
});

// Handle audio processing
app.post('/process', upload.single('audio'), (req, res) => {
  const { repeatCount } = req.body;
  const count = parseInt(repeatCount);
  const inputPath = req.file.path;
  const outputFilename = `output-${Date.now()}.mp3`;
  const outputPath = path.join(__dirname, outputFilename);

  if (!count || count < 1 || count > 100) {
    return res.status(400).send('Invalid repeat count (1-100 allowed).');
  }

  // Create FFmpeg concat list
  const concatListPath = `uploads/concat-list-${Date.now()}.txt`;
  const listContent = Array(count)
    .fill(`file '${path.resolve(inputPath)}'`)
    .join('\n');
  fs.writeFileSync(concatListPath, listContent);

  ffmpeg()
    .input(concatListPath)
    .inputOptions(['-f concat', '-safe 0'])
    .outputOptions('-c copy')
    .on('end', () => {
      fs.unlinkSync(concatListPath);
      res.json({ audioUrl: `/${outputFilename}` });
    })
    .on('error', err => {
      console.error(err);
      res.status(500).send('Failed to process audio.');
    })
    .save(outputPath);
});

// Serve generated files
app.use(express.static(__dirname));

// Create 'uploads' folder if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Start server
app.listen(port, () => {
  console.log(`✅ Server running at: http://localhost:${port}`);
});
