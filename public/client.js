const socket = io();
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const username = document.getElementById('username');
const fileInput = document.getElementById('fileInput');

// Usar para IDs únicos de mensajes locales
function genId() { return "msg"+Math.random().toString(36).slice(2,10)+Date.now(); }

let myName = "";
let LOCAL_OWN_ID = null; // guardar "mi" nombre actual
let visible = true;

window.addEventListener("focus", ()=>{ visible = true; markReadAll(); });
window.addEventListener("blur", ()=>{ visible = false; });

socket.on("full", (msg) => alert(msg));

// Manejar mensajes enviados (propios): insertarlos visual
form.addEventListener('submit', function(e) {
  e.preventDefault();
  if (input.value && username.value) {
    myName = username.value.trim();
    LOCAL_OWN_ID = myName;
    const now = new Date();
    const msgData = {
      id: genId(),
      msg: input.value,
      from: myName,
      time: now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
    };
    appendMessage({ ...msgData, status:"enviado", type:"text"});
    socket.emit('chat message', msgData);
    input.value = '';
  }
});

// Subir archivos multimedia
fileInput.addEventListener("change", function() {
  const file = fileInput.files[0];
  if (!file || !username.value) return;
  myName = username.value.trim();
  LOCAL_OWN_ID = myName;
  const now = new Date();
  const id = genId();

  const formData = new FormData();
  formData.append('file', file);

  fetch('/upload', { method: 'POST', body: formData })
    .then(res => res.json())
    .then(obj => {
      const data = {
        id, from: myName, url: obj.url, time: now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
        mimetype: obj.type
      };
      appendMessage({ id, from: myName, msg: obj.url, time: data.time, status: "enviado",
          type: obj.type.startsWith("image/") ? "image" :
                obj.type.startsWith("video/") ? "video" : "other"
      });
      socket.emit("media message", data);
    });
  fileInput.value = "";
});

// Visualizar historial
socket.on('chat history', function(list) {
  messages.innerHTML = '';
  (list || []).forEach(appendMessage);
  setTimeout(()=>{ markReadAll(); }, 100);
});

// Mensaje recibido (del otro)
socket.on('chat message', function(data) {
  appendMessage(data);
  // Si no enfocado, notificación
  if (!visible) showNotification(data);
  setTimeout(()=>{ markReadAll(); }, 150);
});

// Estado cambiado (marcas) en mi mensaje
socket.on('message status', function({id, status}) {
  const el = document.querySelector(`li[data-id="${id}"] .msg-foot .status-check, li[data-id="${id}"] .msg-foot .status-checked`);
  if (el) {
    if(status==="entregado") {
      el.className = "status-check"; el.textContent = "✔✔";
    }
    if(status==="leido") {
      el.className = "status-checked"; el.textContent = "✔✔";
    }
  }
});

// Render visual de mensaje
function appendMessage({id, msg, from, time, status, type}) {
  if (!id) id = genId();
  const li = document.createElement('li');
  li.dataset.id = id;
  li.className = 'message ' + (from===username.value.trim() ? 'from-me' : 'from-them');
  let body = "";

  // Muestra multimedia integrado
  if(type==="image") {
    body = `<div class="media"><img src="${msg}" /></div>`;
  } else if(type==="video") {
    body = `<div class="media"><video src="${msg}" controls></video></div>`;
  } else {
    body = (msg+"").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  // Cola: hora y checkmarks
  if(from===username.value.trim()) {
    let checked = '<span class="status-check">✔</span>';
    if(status==="entregado") checked = '<span class="status-check">✔✔</span>';
    if(status==="leido") checked = '<span class="status-checked">✔✔</span>';
    li.innerHTML = body + `<div class="msg-foot">${time || ""}${checked}</div>`;
  } else {
    li.innerHTML = body + `<div class="msg-foot">${time||""}</div>`;
  }
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
}

// Marcar leídos (cuando chat en foco)
function markReadAll() {
  // Toma IDs no-leídos y marca
  let theirUnread = [];
  document.querySelectorAll('li.message.from-them').forEach(li=>{
    if (!li.dataset.id) return;
    // Si su status-check no es "read"
    theirUnread.push(li.dataset.id);
  });
  if(theirUnread.length) socket.emit("mark read", theirUnread);
}

// Notificación de mensaje nuevo
function showNotification(data) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    notify(data);
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission(function(permission){
      if(permission === "granted") notify(data);
    });
  }
  function notify(data){
    let body = (data.type==="text") ? data.msg :
      (data.type==="image") ? "📷 Imagen" :
        (data.type==="video") ? "🎥 Video" : "Archivo";
    new Notification("Nuevo mensaje de "+data.from, { body });
  }
}