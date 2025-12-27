// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyBt5BGYZrXvTr1v8dRhZksHrWMZJakZ5Ik",
    authDomain: "chat-app-6f643.firebaseapp.com",
    databaseURL: "https://chat-app-6f643-default-rtdb.firebaseio.com",
    projectId: "chat-app-6f643",
    storageBucket: "chat-app-6f643.appspot.com",
    messagingSenderId: "1033390313638",
    appId: "1:1033390313638:web:fa3d775a0c0c128f31a467"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const ACCOUNTS = {
    'vignesh@gmail.com': { pass: 'vignesh@123', name: 'Vignesh' },
    'dhara@gmail.com': { pass: 'dhara@gmail.com', name: 'Dhara' }
};

let me = localStorage.getItem('loggedEmail');
const TTL = 24 * 60 * 60 * 1000; // 24 Hours

// WebRTC Global Variables for Calling
let localStream;
let peerConnection;
const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };

// --- Start App ---
function start() {
    if (me && ACCOUNTS[me]) {
        showMainChat();
        listenForMessages();
        listenForCalls(); // NEW: Listener for incoming calls
        if (Notification.permission !== "granted") Notification.requestPermission();
    }
}

function showMainChat() {
    document.getElementById('authPage').classList.add('hidden');
    document.getElementById('chatPage').classList.remove('hidden');
    document.getElementById('welcomeUser').textContent = `Welcome, ${ACCOUNTS[me].name}`;
    
    setInterval(() => {
        db.ref(`status/${me.replace(/\./g, '_')}`).set(Date.now());
        updateUserStatus();
    }, 1000);
}

function updateUserStatus() {
    const other = Object.keys(ACCOUNTS).find(e => e !== me);
    const otherKey = other.replace(/\./g, '_');
    
    db.ref(`status/${otherKey}`).on('value', (snapshot) => {
        const lastSeen = snapshot.val();
        const now = Date.now();
        const indicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('userStatus');

        if (lastSeen && (now - lastSeen < 4000)) {
            indicator.className = 'status-pro online';
            statusText.textContent = 'Online';
        } else {
            indicator.className = 'status-pro offline';
            statusText.textContent = 'Offline';
        }
    });
}

// --- Messaging Logic ---
function send(content, type = 'text') {
    const msgData = {
        from: me,
        body: content,
        type: type,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        timestamp: Date.now(),
        expiry: Date.now() + TTL,
        seen: false
    };
    db.ref('messages').push(msgData);
}

function listenForMessages() {
    db.ref('messages').on('value', (snapshot) => {
        const data = snapshot.val();
        render(data);
    });
}

function render(data) {
    const box = document.getElementById('chatBox');
    box.innerHTML = '';
    if (!data) return;

    const now = Date.now();
    Object.keys(data).forEach(key => {
        const m = data[key];
        if (m.expiry < now) {
            db.ref(`messages/${key}`).remove();
            return;
        }
        const isMe = m.from === me;
        if (!isMe && !m.seen) {
            db.ref(`messages/${key}`).update({ seen: true });
        }

        const div = document.createElement('div');
        div.className = `msg-bubble ${isMe ? 'sent' : 'received'}`;
        let contentHtml = m.type === 'text' 
            ? `<div>${m.body}</div>` 
            : `<div class="media-container"><img src="${m.body}" class="msg-img"><button class="btn-download" onclick="downloadMedia('${m.body}')"><i class="fas fa-download"></i> Download</button></div>`;

        const ticks = isMe ? `<span class="ticks ${m.seen ? 'read' : ''}">${m.seen ? '✓✓' : '✓'}</span>` : '';
        div.innerHTML = `${contentHtml}<small style="opacity:0.5; font-size:0.6rem; display:block; text-align:right; margin-top:5px;">${m.time} ${ticks}</small>`;
        box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
}

// --- Call Functionality (NEW) ---
async function startCall(isVideo = true) {
    const other = Object.keys(ACCOUNTS).find(e => e !== me);
    const otherKey = other.replace(/\./g, '_');

    localStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
    document.getElementById('localVideo').srcObject = localStream;
    document.getElementById('videoContainer').classList.remove('hidden');

    peerConnection = new RTCPeerConnection(servers);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
        document.getElementById('remoteVideo').srcObject = event.streams[0];
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    db.ref(`calls/${otherKey}`).set({ offer, isVideo, from: me });

    db.ref(`calls/${me.replace(/\./g, '_')}/answer`).on('value', async (snap) => {
        if (snap.val() && peerConnection.signalingState !== "stable") {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(snap.val()));
        }
    });
}

function listenForCalls() {
    db.ref(`calls/${me.replace(/\./g, '_')}`).on('value', async (snap) => {
        const callData = snap.val();
        if (callData && callData.offer && !peerConnection) {
            if (confirm(`Incoming ${callData.isVideo ? 'Video' : 'Voice'} call from ${ACCOUNTS[callData.from].name}?`)) {
                localStream = await navigator.mediaDevices.getUserMedia({ video: callData.isVideo, audio: true });
                document.getElementById('localVideo').srcObject = localStream;
                document.getElementById('videoContainer').classList.remove('hidden');

                peerConnection = new RTCPeerConnection(servers);
                localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
                
                peerConnection.ontrack = (event) => {
                    document.getElementById('remoteVideo').srcObject = event.streams[0];
                };

                await peerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                
                db.ref(`calls/${callData.from.replace(/\./g, '_')}/answer`).set(answer);
            }
        }
    });
}

// --- UI Event Listeners ---
const msgInput = document.getElementById('messageInput');

// FIX: Send on Enter Key
msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleSendMessage();
    }
});

document.getElementById('sendBtn').onclick = handleSendMessage;

function handleSendMessage() {
    if(msgInput.value.trim()) {
        send(msgInput.value.trim());
        msgInput.value = '';
    }
}

// Set up Call Buttons
document.querySelector('.fa-video').parentElement.onclick = () => startCall(true);
document.querySelector('.fa-phone').parentElement.onclick = () => startCall(false);
document.getElementById('endCallBtn').onclick = () => location.reload();

// Typing Indicator logic
msgInput.oninput = () => { 
    db.ref(`typing/${me.replace(/\./g, '_')}`).set(Date.now()); 
};

setInterval(() => {
    const other = Object.keys(ACCOUNTS).find(e => e !== me);
    const otherKey = other.replace(/\./g, '_');
    db.ref(`typing/${otherKey}`).once('value', (snap) => {
        const lastTyped = snap.val();
        const indicator = document.getElementById('typingIndicator');
        if (lastTyped && (Date.now() - lastTyped < 2000)) {
            indicator.classList.remove('hidden');
            document.getElementById('typingText').textContent = `${ACCOUNTS[other].name} is typing...`;
        } else {
            indicator.classList.add('hidden');
        }
    });
}, 1000);

// File Attachment logic
document.getElementById('attachBtn').onclick = () => document.getElementById('fileInput').click();
document.getElementById('fileInput').onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => send(event.target.result, 'image');
        reader.readAsDataURL(file);
    }
};

// Auth Events
document.getElementById('loginForm').onsubmit = (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.toLowerCase().trim();
    const pass = document.getElementById('password').value;
    if (ACCOUNTS[email] && ACCOUNTS[email].pass === pass) {
        me = email;
        localStorage.setItem('loggedEmail', email);
        location.reload();
    }
};

document.getElementById('logoutBtn').onclick = () => {
    db.ref(`status/${me.replace(/\./g, '_')}`).remove();
    localStorage.removeItem('loggedEmail');
    location.reload();
};

// Screenshot Detection
window.addEventListener('keyup', (e) => {
    if (e.key === 'PrintScreen') {
        document.getElementById('screenshotOverlay').classList.remove('hidden');
        setTimeout(() => document.getElementById('screenshotOverlay').classList.add('hidden'), 3000);
        send(`⚠️ ${ACCOUNTS[me].name} captured a screenshot!`, 'text');
    }
});

function downloadMedia(data) {
    const a = document.createElement('a');
    a.href = data;
    a.download = `EduChat_${Date.now()}.png`;
    a.click();
}

start();