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

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const ACCOUNTS = {
    'vignesh@gmail.com': { pass: 'vignesh@123', name: 'Vignesh' },
    'dhara@gmail.com': { pass: 'dhara@gmail.com', name: 'Dhara' }
};

let me = localStorage.getItem('loggedEmail');
const TTL = 24 * 60 * 60 * 1000; 

let localStream;
let peerConnection;
const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };

function start() {
    if (me && ACCOUNTS[me]) {
        showMainChat();
        listenForMessages();
        listenForCalls();
        handleKeyboardResponsive(); // Mobile Keyboard Fix
        if (Notification.permission !== "granted") Notification.requestPermission();
    }
}

// FIX: This adjusts the UI when the mobile keyboard opens
function handleKeyboardResponsive() {
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            const chatContainer = document.querySelector('.chat-container');
            const chatBox = document.getElementById('chatBox');
            chatContainer.style.height = `${window.visualViewport.height}px`;
            setTimeout(() => { chatBox.scrollTop = chatBox.scrollHeight; }, 100);
        });
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
        const indicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('userStatus');

        if (lastSeen && (Date.now() - lastSeen < 4000)) {
            indicator.className = 'status-pro online';
            statusText.textContent = 'Online';
        } else if (lastSeen) {
            const timeStr = new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
            indicator.className = 'status-pro offline';
            statusText.textContent = `Last seen at ${timeStr}`;
        } else {
            indicator.className = 'status-pro offline';
            statusText.textContent = 'Offline';
        }
    });
}

function send(content, type = 'text') {
    const msgData = {
        from: me,
        body: content,
        type: type,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true}),
        timestamp: Date.now(),
        expiry: Date.now() + TTL,
        seen: false,
        reactions: { "❤️": 0, "😂": 0, "👍": 0 },
        deletedBy: [],
        isDeleted: false
    };
    db.ref('messages').push(msgData);
}

function listenForMessages() {
    db.ref('messages').off();
    db.ref('messages').on('value', (snapshot) => render(snapshot.val()));
}

function render(data) {
    const box = document.getElementById('chatBox');
    box.innerHTML = '';
    if (!data) return;

    Object.keys(data).forEach(key => {
        const m = data[key];
        if (m.deletedBy && m.deletedBy.includes(me)) return;
        if (m.expiry < Date.now()) { db.ref(`messages/${key}`).remove(); return; }

        const isMe = m.from === me;
        if (!isMe && !m.seen) db.ref(`messages/${key}`).update({ seen: true });

        const wrapper = document.createElement('div');
        wrapper.className = `msg-wrapper ${isMe ? 'sent-wrapper' : 'received-wrapper'}`;

        const div = document.createElement('div');
        div.className = `msg-bubble ${isMe ? 'sent' : 'received'}`;
        
        let contentHtml = m.isDeleted ? `<div class="msg-deleted"><i class="fas fa-ban"></i> Deleted</div>` 
            : (m.type === 'text' ? `<div>${m.body}</div>` : `<img src="${m.body}" class="msg-img">`);

        let reactionDisplay = '';
        if(m.reactions && !m.isDeleted) {
            Object.entries(m.reactions).forEach(([emoji, count]) => { if(count > 0) reactionDisplay += `<span class="reaction-badge">${emoji} ${count}</span>`; });
        }

        const ticks = isMe ? `<span class="ticks ${m.seen ? 'read' : ''}">${m.seen ? '✓✓' : '✓'}</span>` : '';
        div.innerHTML = `${contentHtml}<div style="margin-top:4px;">${reactionDisplay}</div><small style="opacity:0.5; font-size:0.6rem; display:block; text-align:right;">${m.time} ${ticks}</small>`;

        const trigger = document.createElement('div');
        trigger.className = 'menu-trigger';
        trigger.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
        if (!m.isDeleted) trigger.onclick = (e) => toggleMenu(e, key, isMe);
        else trigger.style.display = 'none';

        wrapper.appendChild(div);
        wrapper.appendChild(trigger);
        box.appendChild(wrapper);
    });
    box.scrollTop = box.scrollHeight;
}

function toggleMenu(e, key, isMe) {
    const old = document.querySelector('.options-popup');
    if (old) old.remove();

    const popup = document.createElement('div');
    popup.className = 'options-popup';
    popup.style.top = `${e.pageY - 50}px`;
    popup.style.left = isMe ? `${e.pageX - 175}px` : `${e.pageX}px`;

    popup.innerHTML = `
        <div class="reaction-bar">
            <span onclick="reactMsg('${key}', '❤️')">❤️</span>
            <span onclick="reactMsg('${key}', '😂')">😂</span>
            <span onclick="reactMsg('${key}', '👍')">👍</span>
        </div>
        <div class="option-item" onclick="deleteForMe('${key}')"><i class="fas fa-eye-slash"></i> Delete for me</div>
        ${isMe ? `<div class="option-item danger" onclick="deleteForEveryone('${key}')"><i class="fas fa-users-slash"></i> Delete for everyone</div>` : ''}
    `;

    document.body.appendChild(popup);
    setTimeout(() => { window.onclick = () => { popup.remove(); window.onclick = null; }; }, 100);
}

function reactMsg(key, emoji) {
    db.ref(`messages/${key}/reactions/${emoji}`).transaction(c => (c || 0) + 1);
}

function deleteForEveryone(key) {
    if(confirm("Delete for everyone?")) db.ref(`messages/${key}`).update({ body: "This message was deleted", isDeleted: true, reactions: { "❤️": 0, "😂": 0, "👍": 0 } });
}

function deleteForMe(key) {
    db.ref(`messages/${key}/deletedBy`).once('value', (s) => {
        let list = s.val() || [];
        if (!list.includes(me)) { list.push(me); db.ref(`messages/${key}`).update({ deletedBy: list }); }
    });
}

// Calls, Typing, Screenshots
async function startCall(isVideo = true) {
    const other = Object.keys(ACCOUNTS).find(e => e !== me);
    const otherKey = other.replace(/\./g, '_');
    localStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
    document.getElementById('localVideo').srcObject = localStream;
    document.getElementById('videoContainer').classList.remove('hidden');
    peerConnection = new RTCPeerConnection(servers);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    peerConnection.ontrack = (event) => { document.getElementById('remoteVideo').srcObject = event.streams[0]; };
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    db.ref(`calls/${otherKey}`).set({ offer, isVideo, from: me });
    db.ref(`calls/${me.replace(/\./g, '_')}/answer`).on('value', async (snap) => {
        if (snap.val() && peerConnection.signalingState !== "stable") { await peerConnection.setRemoteDescription(new RTCSessionDescription(snap.val())); }
    });
}

function listenForCalls() {
    db.ref(`calls/${me.replace(/\./g, '_')}`).on('value', async (snap) => {
        const callData = snap.val();
        if (callData && callData.offer && !peerConnection) {
            if (confirm(`Incoming call from ${ACCOUNTS[callData.from].name}?`)) {
                localStream = await navigator.mediaDevices.getUserMedia({ video: callData.isVideo, audio: true });
                document.getElementById('localVideo').srcObject = localStream;
                document.getElementById('videoContainer').classList.remove('hidden');
                peerConnection = new RTCPeerConnection(servers);
                localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
                peerConnection.ontrack = (event) => { document.getElementById('remoteVideo').srcObject = event.streams[0]; };
                await peerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                db.ref(`calls/${callData.from.replace(/\./g, '_')}/answer`).set(answer);
            }
        }
    });
}

const msgInput = document.getElementById('messageInput');
msgInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && msgInput.value.trim()) { send(msgInput.value.trim()); msgInput.value = ''; } });
document.getElementById('sendBtn').onclick = () => { if (msgInput.value.trim()) { send(msgInput.value.trim()); msgInput.value = ''; } };

document.querySelector('.fa-video').parentElement.onclick = () => startCall(true);
document.querySelector('.fa-phone').parentElement.onclick = () => startCall(false);
document.getElementById('endCallBtn').onclick = () => location.reload();

msgInput.oninput = () => { db.ref(`typing/${me.replace(/\./g, '_')}`).set(Date.now()); };
setInterval(() => {
    const other = Object.keys(ACCOUNTS).find(e => e !== me);
    const otherKey = other.replace(/\./g, '_');
    db.ref(`typing/${otherKey}`).once('value', (snap) => {
        const lastTyped = snap.val();
        const indicator = document.getElementById('typingIndicator');
        if (lastTyped && (Date.now() - lastTyped < 2000)) {
            indicator.classList.remove('hidden');
            document.getElementById('typingText').textContent = `${ACCOUNTS[other].name} is typing...`;
        } else { indicator.classList.add('hidden'); }
    });
}, 1000);

document.getElementById('attachBtn').onclick = () => document.getElementById('fileInput').click();
document.getElementById('fileInput').onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => send(event.target.result, 'image');
        reader.readAsDataURL(file);
    }
};

document.getElementById('loginForm').onsubmit = (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.toLowerCase().trim();
    const pass = document.getElementById('password').value;
    if (ACCOUNTS[email] && ACCOUNTS[email].pass === pass) { me = email; localStorage.setItem('loggedEmail', email); location.reload(); }
};

document.getElementById('logoutBtn').onclick = () => {
    db.ref(`status/${me.replace(/\./g, '_')}`).remove();
    localStorage.removeItem('loggedEmail');
    location.reload();
};

window.addEventListener('keyup', (e) => {
    if (e.key === 'PrintScreen') {
        document.getElementById('screenshotOverlay').classList.remove('hidden');
        setTimeout(() => document.getElementById('screenshotOverlay').classList.add('hidden'), 3000);
        send(`⚠️ ${ACCOUNTS[me].name} captured a screenshot!`, 'text');
    }
});

start();