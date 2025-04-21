const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

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
  // Envía sólo el nombre de archivo
  const url = '/uploads/' + req.file.filename;
  res.json({ url, type: req.file.mimetype });
});

let sockets = [];
let messages = []; // [{msg,type,filename?,date}] mensajes y/o multimedia

// ENVÍO POR SOCKET
io.on("connection", (socket) => {
  if (sockets.length >= 2) {
    socket.emit("full", "Solo se permite una persona conectada además del dueño.");
    socket.disconnect();
    return;
  }
  sockets.push(socket);

  // Cuando entra alguien, envía mensajes existentes (excepto los viejos)
  socket.emit("chat history", messages.filter(m=>Date.now()-m.date<24*3600*1000));

  socket.on("chat message", (msg) => {
    const data = { msg, type: "text", date: Date.now() };
    messages.push(data);
    sockets.forEach(s => { if (s !== socket) s.emit("chat message", data); });
  });
  socket.on("media message", (url, type) => {
    const data = { msg: url, type, date: Date.now() };
    messages.push(data);
    sockets.forEach(s => { if (s !== socket) s.emit("chat message", data); });
  });
  socket.on("disconnect", () => {
    sockets = sockets.filter(s => s !== socket);
  });
});

// BORRADO AUTOMÁTICO POR TIEMPO 🕒
setInterval(() => {
  const threshold = Date.now() - 24*3600*1000;
  // Borra mensajes y archivos viejos
  messages = messages.filter(m => {
    if (m.date < threshold && m.type !== 'text') {
      // Es archivo; borra físico
      const fileToDelete = path.join(uploadDir, path.basename(m.msg));
      fs.unlink(fileToDelete, () => {});
    }
    return m.date >= threshold; // Mantiene recientes
  });
}, 60*60*1000); // limpia cada 1 hora

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🟢 Servidor escuchando en http://localhost:${PORT}`);
});