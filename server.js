const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random()*1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

app.use(express.static("public"));

app.post('/upload', upload.single('file'), (req, res) => {
  const url = '/uploads/' + req.file.filename;
  res.json({ url, type: req.file.mimetype });
});

let sockets = [];
let messages = []; // {id, from, msg, time, type, status, date}

io.on("connection", (socket) => {
  if (sockets.length >= 2) {
    socket.emit("full", "Solo se permite una persona conectada además del dueño.");
    socket.disconnect();
    return;
  }
  sockets.push(socket);

  // Devuelve mensajes recientes
  socket.emit("chat history", messages.filter(m => Date.now()-m.date<24*3600*1000));

  // Recibe texto
  socket.on("chat message", (data) => {
    // data: {id, msg, from, time}
    const nuevo = {...data, type: "text", status:"enviado", date: Date.now()};
    messages.push(nuevo);
    // self: status enviado; al otro: entregado
    socket.emit("message status", {id: data.id, status: "enviado"});
    sockets.forEach(s => {
      if (s !== socket)
        s.emit("chat message", {...nuevo, status:"entregado"});
    });
  });

  // Recibe media (img/video)
  socket.on("media message", (data) => {
    // data: {id, url, from, time, mimetype}
    let type = "other";
    if (data.mimetype.startsWith("image/")) type = "image";
    if (data.mimetype.startsWith("video/")) type = "video";
    const nuevo = {id:data.id, msg:data.url, from:data.from, time:data.time, type, status:"enviado", date: Date.now()};
    messages.push(nuevo);
    socket.emit("message status", {id: data.id, status: "enviado"});
    sockets.forEach(s => {
      if (s !== socket)
        s.emit("chat message", {...nuevo, status:"entregado"});
    });
  });

  // Marcar como leídos (cuando usuario ve mensajes)
  socket.on("mark read", ids => {
    messages.forEach(m => { if(ids.includes(m.id)) m.status="leido"; });
    // Envía nueva marca de leído al emisor
    sockets.forEach(s => {
      if (s !== socket) {
        ids.forEach(id=>{
          s.emit("message status", {id, status:"leido"});
        });
      }
    });
  });

  socket.on("disconnect", ()=>{
    sockets = sockets.filter(s => s !== socket);
  });
});

// Borrado cada hora (mantén tus archivos limpios)
setInterval(() => {
  const limit = Date.now() - 24*3600*1000;
  messages = messages.filter(m => {
    if(m.date < limit && (m.type==="image" || m.type==="video")){
      const file = path.join(uploadDir, path.basename(m.msg));
      fs.unlink(file, ()=>{});
    }
    return m.date >= limit;
  });
}, 60*60*1000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});