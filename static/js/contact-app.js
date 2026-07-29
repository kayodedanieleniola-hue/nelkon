/* =====================================================================
   CONTACT APP — contact-app.js
   Handles contact list, chat UI, and message handling for contact.html
   Requires: auth-modal.js, supabase-config.js, Supabase SDK
   ===================================================================== */

let supabase = null;

const LOCKED_CONTACTS = [
  { name: 'Marketing Lead', preview: 'Locked — referral required' },
  { name: 'Creative Director', preview: 'Locked — referral required' },
  { name: 'IT Systems Lead', preview: 'Locked — referral required' },
  { name: 'AI Strategy Lead', preview: 'Locked — referral required' },
  { name: 'Content Manager', preview: 'Locked — referral required' },
  { name: 'Cultural Markets Lead', preview: 'Locked — referral required' },
  { name: 'Client Success Lead', preview: 'Locked — referral required' },
  { name: 'Finance Desk', preview: 'Locked — referral required' },
  { name: 'Partnerships Lead', preview: 'Locked — referral required' }
];

const CHAT_PROFILES = {
  owner: {
    name: 'Owner of the Brand',
    avatarClass: 'owner',
    avatarChar: '★',
    opener: "Hey! Thanks for reaching out — I'm the owner here. What's on your mind?"
  },
  ai: {
    name: 'Nakconel AI',
    avatarClass: 'ai',
    avatarChar: '◈',
    opener: "Hi, I'm Nakconel AI. Ask me anything about our brand strategy, services, or how we can help your business."
  }
};

const screenGate = document.getElementById('screenGate');
const screenList = document.getElementById('screenList');
const screenChat = document.getElementById('screenChat');
const toast = document.getElementById('lockToast');
const chatMessages = document.getElementById('chatMessages');

let activeChat = null;
let toastTimer = null;

function initNavigation(){
  const aboutDropBtn = document.getElementById('aboutDropBtn');
  const aboutDropMenu = document.getElementById('aboutDropMenu');
  const navbar = document.getElementById('navbar');
  const menuToggle = document.getElementById('menuToggle');
  const navLinks = document.getElementById('navLinks');

  if(aboutDropBtn && aboutDropMenu){
    const openDropdown = () => {
      aboutDropBtn.classList.add('open');
      aboutDropMenu.classList.add('open');
      aboutDropBtn.setAttribute('aria-expanded', 'true');
    };
    const closeDropdown = () => {
      aboutDropBtn.classList.remove('open');
      aboutDropMenu.classList.remove('open');
      aboutDropBtn.setAttribute('aria-expanded', 'false');
    };

    aboutDropBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      aboutDropMenu.classList.contains('open') ? closeDropdown() : openDropdown();
    });
    document.addEventListener('click', closeDropdown);
    aboutDropMenu.addEventListener('click', (e) => e.stopPropagation());
  }

  if(navbar){
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 50);
    }, { passive: true });
  }

  if(menuToggle && navLinks){
    const spans = menuToggle.querySelectorAll('span');
    const resetMenuIcon = () => {
      spans[0].style.transform = 'none';
      spans[1].style.opacity = '1';
      spans[2].style.transform = 'none';
    };

    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      if(navLinks.classList.contains('open')){
        spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'rotate(-45deg) translate(6px, -6px)';
      } else {
        resetMenuIcon();
      }
    });

    document.querySelectorAll('.nav-links a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        resetMenuIcon();
      });
    });
  }
}

function showScreen(name){
  screenGate.style.display = name === 'gate' ? 'block' : 'none';
  screenList.style.display = name === 'list' ? 'block' : 'none';
  screenChat.style.display = name === 'chat' ? 'flex' : 'none';
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  if(supabase) await supabase.auth.signOut();
  showScreen('gate');
});

async function contactAuthComplete(profile){
  supabase = AuthModal.supabaseClient();
  const listMe = document.getElementById('listMe');
  const displayName = (profile && (profile.name || profile.email)) || 'You';
  const avatarUrl = profile ? profile.avatar_url : null;

  listMe.innerHTML = `
    ${avatarUrl ? `<img class="mini-avatar" src="${avatarUrl}" alt="">` : '<div class="mini-avatar" style="display:flex;align-items:center;justify-content:center;background:rgba(201,154,74,0.15);color:var(--bronze);">' + (displayName ? displayName[0].toUpperCase() : '?') + '</div>'}
    <div><strong>${displayName}</strong></div>
  `;
  await renderContacts();
  showScreen('list');
}

async function renderContacts(){
  const list = document.getElementById('contactGrid');
  list.innerHTML = '';

  const owner = document.createElement('div');
  owner.className = 'contact-row owner';
  owner.innerHTML = `<div class="contact-avatar">★</div><div class="contact-mid"><div class="contact-name">Owner of the Brand</div><div class="contact-preview">Tap to start chatting</div></div><div class="contact-side"><span class="contact-time">Online</span></div>`;
  owner.addEventListener('click', () => openChat('owner'));
  list.appendChild(owner);

  const ai = document.createElement('div');
  ai.className = 'contact-row ai';
  ai.innerHTML = `<div class="contact-avatar">◈</div><div class="contact-mid"><div class="contact-name">Nakconel AI</div><div class="contact-preview">Ask me anything about the brand</div></div><div class="contact-side"><span class="contact-time">Online</span></div>`;
  ai.addEventListener('click', () => openChat('ai'));
  list.appendChild(ai);

  LOCKED_CONTACTS.forEach(c => {
    const row = document.createElement('div');
    row.className = 'contact-row locked';
    row.innerHTML = `<div class="contact-avatar">${c.name[0]}</div><div class="contact-mid"><div class="contact-name">${c.name}</div><div class="contact-preview">🔒 ${c.preview}</div></div><div class="contact-side"><span class="contact-padlock">🔒</span></div>`;
    row.addEventListener('click', showLockToast);
    list.appendChild(row);
  });
}

function showLockToast(){
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 5000);
}

function timeNow(){
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function addMessage(text, who, attachment){
  const row = document.createElement('div');
  row.className = `msg-row ${who}`;
  let attachHtml = '';
  if(attachment){
    attachHtml = attachment.isImage ? `<img class="msg-attach-img" src="${attachment.url}" alt="${attachment.name}">` : `<div class="msg-attach-file">📄 ${attachment.name}</div>`;
  }
  row.innerHTML = `<div class="msg-bubble">${attachHtml}${text || ''}<span class="msg-time">${timeNow()}</span></div>`;
  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function openChat(key){
  activeChat = key;
  const profile = CHAT_PROFILES[key];
  document.getElementById('chatAvatar').className = `chat-avatar ${profile.avatarClass}`;
  document.getElementById('chatAvatar').textContent = profile.avatarChar;
  document.getElementById('chatName').textContent = profile.name;
  chatMessages.innerHTML = '';
  addMessage(profile.opener, 'them');
  showScreen('chat');
  document.getElementById('chatInput').focus();
}

function sendPlaceholderReply(){
  setTimeout(() => {
    const reply = activeChat === 'ai' ? "Got your file! Real AI-powered responses will go live once the backend is connected." : "Got it — the Owner will review this once messaging is connected to a real backend.";
    addMessage(reply, 'them');
  }, 700);
}

document.getElementById('chatBack').addEventListener('click', () => { activeChat = null; showScreen('list'); });
document.getElementById('chatAttachBtn').addEventListener('click', () => document.getElementById('chatFileInput').click());
document.getElementById('chatFileInput').addEventListener('change', () => {
  const fileInput = document.getElementById('chatFileInput');
  const file = fileInput.files[0];
  if(!file) return;
  const isImage = file.type.startsWith('image/');
  if(isImage){
    const reader = new FileReader();
    reader.onload = () => { addMessage('', 'me', { isImage: true, url: reader.result, name: file.name }); fileInput.value = ''; sendPlaceholderReply(); };
    reader.readAsDataURL(file);
  } else {
    addMessage('', 'me', { isImage: false, name: file.name });
    fileInput.value = '';
    sendPlaceholderReply();
  }
});
document.getElementById('chatInputForm').addEventListener('submit', e => {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if(!text) return;
  addMessage(text, 'me');
  input.value = '';
  sendPlaceholderReply();
});

initNavigation();
showScreen('gate');
(async () => {
  supabase = AuthModal.supabaseClient();
  if(!supabase) return;
  await AuthModal.resumeSession(contactAuthComplete);
})();
