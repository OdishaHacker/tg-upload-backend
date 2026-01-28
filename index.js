const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const session = require("express-session");
const crypto = require("crypto");
const path = require("path");

const app = express();
const upload = multer({
  dest: "/tmp",
  limits: { fileSize: 5 * 1024 * 1024 * 1024 } // 5GB
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const BASE_URL = process.env.BASE_URL;

const ADMIN_USER = "admin";
const ADMIN_PASS = "12345";

const progressMap = {};
const fileMap = {}; // token => { parts: [file_id], name }

app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "tg-storage",
  resave: false,
  saveUninitialized: false
}));

/* ========== AUTH ========== */
function auth(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

/* ========== LOGIN ========== */
app.get("/login", (_, res) => {
  res.send(`
  <style>
  body{background:#020617;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}
  .box{background:#020617;padding:30px;border-radius:14px;width:280px}
  input,button{width:100%;margin-top:10px;padding:10px;border-radius:8px;border:none}
  button{background:#22c55e;font-weight:bold}
  </style>
  <form class="box" method="POST">
  <h2>Login</h2>
  <input name="username" placeholder="Username" required>
  <input name="password" type="password" placeholder="Password" required>
  <button>Login</button>
  </form>
  `);
});

app.post("/login", (req, res) => {
  if (req.body.username === ADMIN_USER && req.body.password === ADMIN_PASS) {
    req.session.user = true;
    return res.redirect("/");
  }
  res.send("❌ Wrong login");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

/* ========== UI ========== */
app.get("/", auth, (_, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{background:#020617;color:#e5e7eb;font-family:sans-serif}
.card{max-width:380px;margin:80px auto;padding:24px;border-radius:16px;background:#020617;box-shadow:0 0 30px #000}
button{background:#22c55e;border:none;padding:12px;width:100%;border-radius:12px;font-weight:bold}
input{width:100%;margin:12px 0}
.progress{height:8px;background:#1e293b;border-radius:10px;overflow:hidden}
.bar{height:8px;width:0%;background:linear-gradient(90deg,#22c55e,#4ade80);transition:width .25s}
small{opacity:.7}
a{color:#38bdf8;word-break:break-all}
</style>
</head>
<body>
<div class="card">
<h2>Telegram Storage</h2>
<form id="form">
<input type="file" name="file" required>
<button>Upload</button>
</form>
<div class="progress"><div class="bar" id="bar"></div></div>
<small id="percent"></small>
<div id="result"></div>
<br><a href="/logout">Logout</a>
</div>

<script>
const form=document.getElementById("form");
const bar=document.getElementById("bar");
const percent=document.getElementById("percent");
const result=document.getElementById("result");

form.onsubmit=e=>{
e.preventDefault();
bar.style.width="0%";
percent.textContent="Starting...";
result.innerHTML="";

const fd=new FormData(form);
fetch("/upload",{method:"POST",body:fd})
.then(r=>r.json())
.then(d=>{
const es=new EventSource("/progress/"+d.token);
es.onmessage=e=>{
bar.style.width=e.data+"%";
percent.textContent=e.data+"%";
if(e.data>=100){
es.close();
result.innerHTML='<a href="'+d.download+'" target="_blank">⬇ Download File</a>';
}
};
});
};
</script>
</body>
</html>
`);
});

/* ========== PROGRESS STREAM ========== */
app.get("/progress/:id", auth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  const t=req.params.id;
  const i=setInterval(()=>{
    res.write(`data: ${progressMap[t]||0}\n\n`);
    if(progressMap[t]>=100){clearInterval(i);res.end();}
  },300);
});

/* ========== UPLOAD (CHUNKED INTERNAL) ========== */
app.post("/upload", auth, upload.single("file"), async (req, res) => {
  const token=crypto.randomUUID();
  progressMap[token]=0;
  fileMap[token]={parts:[],name:req.file.originalname};

  const CHUNK=20*1024*1024; // 20MB
  const size=fs.statSync(req.file.path).size;
  const total=Math.ceil(size/CHUNK);

  const fd=fs.openSync(req.file.path,"r");
  for(let i=0;i<total;i++){
    const buf=Buffer.alloc(Math.min(CHUNK,size-i*CHUNK));
    fs.readSync(fd,buf,0,buf.length,i*CHUNK);

    const f=new FormData();
    f.append("chat_id",CHANNEL_ID);
    f.append("document",buf,{filename:req.file.originalname+".part"+i});

    const tg=await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
      f,{headers:f.getHeaders(),maxBodyLength:Infinity}
    );

    fileMap[token].parts.push(tg.data.result.document.file_id);
    progressMap[token]=Math.floor(((i+1)/total)*100);
  }
  fs.unlinkSync(req.file.path);

  res.json({
    token,
    download:`${BASE_URL}/download/${token}`
  });
});

/* ========== DOWNLOAD (MERGED STREAM) ========== */
app.get("/download/:token", async (req,res)=>{
  const info=fileMap[req.params.token];
  if(!info) return res.send("Invalid link");

  res.setHeader("Content-Disposition",`attachment; filename="${info.name}"`);

  for(const fid of info.parts){
    const f=await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fid}`);
    const url=`https://api.telegram.org/file/bot${BOT_TOKEN}/${f.data.result.file_path}`;
    const s=await axios({url,responseType:"stream"});
    await new Promise(r=>s.data.pipe(res,{end:false}).on("end",r));
  }
  res.end();
});

app.listen(5000,()=>console.log("🔥 Telegram Storage Live"));
