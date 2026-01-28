const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const session = require("express-session");
const path = require("path");
const crypto = require("crypto");

const app = express();

/* ================= CONFIG ================= */

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const BASE_URL = process.env.BASE_URL;

const ADMIN_USER = "admin";
const ADMIN_PASS = "12345";

/* ================= MULTER (NO SIZE LIMIT) ================= */

const upload = multer({
  dest: "/tmp",
  limits: {
    fileSize: Infinity
  }
});

/* ================= MIDDLEWARE ================= */

app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: "tg-upload-secret",
    resave: false,
    saveUninitialized: false,
  })
);

/* ================= AUTH ================= */

function auth(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

/* ================= LOGIN ================= */

app.get("/login", (req, res) => {
  res.send(`
  <form method="POST">
    <input name="username" placeholder="Username" />
    <input type="password" name="password" placeholder="Password" />
    <button>Login</button>
  </form>
  `);
});

app.post("/login", (req, res) => {
  if (
    req.body.username === ADMIN_USER &&
    req.body.password === ADMIN_PASS
  ) {
    req.session.user = true;
    return res.redirect("/");
  }
  res.send("Invalid Login");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

/* ================= UI ================= */

app.get("/", auth, (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<body style="background:#020617;color:#fff;font-family:sans-serif">
<h2>Telegram Storage</h2>
<form id="f">
<input type="file" name="file" required />
<button>Upload</button>
</form>
<pre id="r"></pre>
<script>
f.onsubmit=e=>{
e.preventDefault();
const d=new FormData(f);
fetch("/upload",{method:"POST",body:d})
.then(r=>r.text()).then(t=>r.innerHTML=t);
}
</script>
<a href="/logout">Logout</a>
</body>
</html>
`);
});

/* ================= CHUNK UPLOAD ================= */

const CHUNK_SIZE = 20 * 1024 * 1024; // 20MB

async function sendChunk(filePath, name) {
  const form = new FormData();
  form.append("chat_id", CHANNEL_ID);
  form.append("document", fs.createReadStream(filePath), name);

  const res = await axios.post(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
    form,
    { headers: form.getHeaders() }
  );

  return res.data.result.document.file_id;
}

/* ================= UPLOAD ================= */

app.post("/upload", auth, upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const size = fs.statSync(filePath).size;

    const chunks = [];
    const fd = fs.openSync(filePath, "r");

    let offset = 0;
    let index = 0;

    while (offset < size) {
      const partPath = `/tmp/${crypto.randomUUID()}.part`;
      const buffer = Buffer.alloc(Math.min(CHUNK_SIZE, size - offset));
      fs.readSync(fd, buffer, 0, buffer.length, offset);
      fs.writeFileSync(partPath, buffer);

      const fileId = await sendChunk(
        partPath,
        `${originalName}.part${index}`
      );

      chunks.push(fileId);
      fs.unlinkSync(partPath);

      offset += buffer.length;
      index++;
    }

    fs.closeSync(fd);
    fs.unlinkSync(filePath);

    const token = crypto.randomUUID();
    fs.writeFileSync(`/tmp/${token}.json`, JSON.stringify({
      name: originalName,
      parts: chunks
    }));

    const link = `${BASE_URL}/download/${token}`;

    res.send(`✅ Uploaded<br><a href="${link}">${link}</a>`);

  } catch (e) {
    console.error(e);
    res.send("❌ Upload Failed");
  }
});

/* ================= DOWNLOAD ================= */

app.get("/download/:id", async (req, res) => {
  try {
    const meta = JSON.parse(
      fs.readFileSync(`/tmp/${req.params.id}.json`)
    );

    const finalPath = `/tmp/${meta.name}`;
    const w = fs.createWriteStream(finalPath);

    for (const fileId of meta.parts) {
      const g = await axios.get(
        `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
      );

      const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${g.data.result.file_path}`;
      const r = await axios({ url, responseType: "stream" });

      await new Promise(ok => {
        r.data.pipe(w, { end: false });
        r.data.on("end", ok);
      });
    }

    w.end(() => {
      res.download(finalPath, meta.name, () => fs.unlinkSync(finalPath));
    });

  } catch (e) {
    console.error(e);
    res.send("❌ Download Failed");
  }
});

/* ================= START ================= */

app.listen(5000, () => console.log("🚀 Server running"));
