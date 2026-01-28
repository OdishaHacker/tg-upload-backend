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
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

/**
 * HOME PAGE
 */
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

/**
 * UPLOAD
 */
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const originalName = req.file.originalname;

    const form = new FormData();
    form.append("chat_id", CHANNEL_ID);
    form.append("document", fs.createReadStream(req.file.path), originalName);

    const tgRes = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
      form,
      { headers: form.getHeaders() }
    );

    fs.unlinkSync(req.file.path);

    const fileId = tgRes.data.result.document.file_id;
    const fileName = tgRes.data.result.document.file_name;

    const downloadLink = `${BASE_URL}/download/${fileId}?name=${encodeURIComponent(fileName)}`;

    res.send(`
      <h3>✅ Upload Successful</h3>
      <p>Download link:</p>
      <a href="${downloadLink}">${downloadLink}</a>
    `);

  } catch (err) {
    console.error(err);
    res.status(500).send("Upload failed");
  }
});

/**
 * DOWNLOAD (SAME NAME + SAME FORMAT)
 */
app.get("/download/:fileId", async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const fileName = req.query.name || "download";

    // get telegram file path
    const tgFile = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
    );

    const filePath = tgFile.data.result.file_path;
    const tgFileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    // temp file path
    const tempPath = `/tmp/${fileName}`;

    // download file from telegram
    const response = await axios({
      method: "GET",
      url: tgFileUrl,
      responseType: "stream",
    });

    const writer = fs.createWriteStream(tempPath);
    response.data.pipe(writer);

    writer.on("finish", () => {
      res.download(tempPath, fileName, () => {
        fs.unlinkSync(tempPath);
      });
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Download failed");
  }
});

/**
 * START SERVER
 */
app.listen(5000, () => console.log("Server running on port 5000"));
