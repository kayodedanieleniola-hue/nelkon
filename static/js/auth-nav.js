import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { auth } from '/static/js/firebase-config.js';

onAuthStateChanged(auth, (user) => {
  const authBtn = document.getElementById('navAuthBtn');
  const avatarWrap = document.getElementById('navAvatarWrap');
  if (!authBtn || !avatarWrap) return;

  if (user) {
    authBtn.style.display = 'none';
    avatarWrap.style.display = 'flex';

    const img = avatarWrap.querySelector('.nav-avatar-img');
    const initials = avatarWrap.querySelector('.nav-avatar-initials');
    const nameEl = avatarWrap.querySelector('.nav-dd-name');
    const emailEl = avatarWrap.querySelector('.nav-dd-email');

    if (nameEl) nameEl.textContent = user.displayName || 'Account';
    if (emailEl) emailEl.textContent = user.email || '';

    if (user.photoURL) {
      img.src = user.photoURL;
      img.style.display = 'block';
      if (initials) initials.style.display = 'none';
    } else {
      img.style.display = 'none';
      if (initials) {
        const name = user.displayName || user.email || '?';
        initials.textContent = name.charAt(0).toUpperCase();
        initials.style.display = 'flex';
      }
    }
  } else {
    authBtn.style.display = 'inline-flex';
    avatarWrap.style.display = 'none';
  }
});

document.addEventListener('click', (e) => {
  const wrap = document.getElementById('navAvatarWrap');
  if (!wrap) return;
  const menu = wrap.querySelector('.nav-avatar-dd');
  if (wrap.contains(e.target)) {
    menu.classList.toggle('open');
  } else {
    menu.classList.remove('open');
  }
});

window.nakSignOut = async () => {
  await signOut(auth);
  window.location.href = '/login';
};
