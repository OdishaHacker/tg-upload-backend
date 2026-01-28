const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const app = express();
const upload = multer({ dest: "/tmp" });

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const form = new FormData();
        form.append("chat_id", CHANNEL_ID);
        form.append("document", fs.createReadStream(req.file.path));

        await axios.post(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
            form,
            { headers: form.getHeaders() }
        );

        fs.unlinkSync(req.file.path);

        res.json({ success: true, message: "File uploaded to Telegram" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Upload failed" });
    }
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});
