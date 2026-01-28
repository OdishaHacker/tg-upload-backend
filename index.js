const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const path = require("path");

const app = express();
const upload = multer({ dest: "/tmp" });

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const BASE_URL = process.env.BASE_URL; // site URL

app.get("/", (req, res) => {
  res.send(`
    <h2>Upload File to Telegram</h2>
    <form action="/upload" method="post" enctype="multipart/form-data">
      <input type="file" name="file" required />
      <br><br>
      <button type="submit">Upload</button>
    </form>
  `);
});

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const form = new FormData();
    form.append("chat_id", CHANNEL_ID);
    form.append("document", fs.createReadStream(req.file.path));

    const tgRes = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
      form,
      { headers: form.getHeaders() }
    );

    fs.unlinkSync(req.file.path);

    const fileId = tgRes.data.result.document.file_id;
    const downloadLink = `${BASE_URL}/download/${fileId}`;

    res.send(`
      <h3>✅ Upload Successful</h3>
      <p>Download link:</p>
      <a href="${downloadLink}" target="_blank">${downloadLink}</a>
    `);

  } catch (e) {
    res.status(500).send("Upload failed");
  }
});

app.get("/download/:fileId", async (req, res) => {
  try {
    const fileId = req.params.fileId;

    const fileRes = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
    );

    const filePath = fileRes.data.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    res.redirect(fileUrl);
  } catch (e) {
    res.status(500).send("Download failed");
  }
});

app.listen(5000, () => console.log("Server running"));
