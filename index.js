const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const app = express();

/**
 * Multer setup
 * Files temporary /tmp folder me save honge
 */
const upload = multer({ dest: "/tmp" });

/**
 * Environment variables (Coolify se aayenge)
 */
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

/**
 * HOME PAGE
 * Browser se open karne par upload form dikhega
 */
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Telegram Upload</title>
      </head>
      <body>
        <h2>Upload File to Telegram</h2>
        <form action="/upload" method="post" enctype="multipart/form-data">
          <input type="file" name="file" required />
          <br><br>
          <button type="submit">Upload</button>
        </form>
      </body>
    </html>
  `);
});

/**
 * UPLOAD API
 * File receive karke Telegram private channel me bhejta hai
 */
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    const form = new FormData();
    form.append("chat_id", CHANNEL_ID);
    form.append("document", fs.createReadStream(req.file.path));

    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
      form,
      { headers: form.getHeaders() }
    );

    // temp file delete
    fs.unlinkSync(req.file.path);

    res.send("✅ File uploaded to Telegram successfully!");

  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Upload failed");
  }
});

/**
 * SERVER START
 */
app.listen(5000, () => {
  console.log("Server running on port 5000");
});
