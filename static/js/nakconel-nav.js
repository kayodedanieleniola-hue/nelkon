/* =====================================================================
   NAKCONEL NAVIGATION JS
   Shared navigation behavior: dropdown, mobile menu, scroll effects
   ===================================================================== */

(function() {
  'use strict';

  // ---- NAVBAR SCROLL EFFECT ----
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }, { passive: true });
  }

  // ---- ABOUT DROPDOWN ----
  const aboutDropBtn = document.getElementById('aboutDropBtn');
  const aboutDropMenu = document.getElementById('aboutDropMenu');

  if (aboutDropBtn && aboutDropMenu) {
    function openDropdown() {
      aboutDropBtn.classList.add('open');
      aboutDropMenu.classList.add('open');
      aboutDropBtn.setAttribute('aria-expanded', 'true');
    }

    function closeDropdown() {
      aboutDropBtn.classList.remove('open');
      aboutDropMenu.classList.remove('open');
      aboutDropBtn.setAttribute('aria-expanded', 'false');
    }

    aboutDropBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (aboutDropMenu.classList.contains('open')) {
        closeDropdown();
      } else {
        openDropdown();
      }
    });

    document.addEventListener('click', () => closeDropdown());
    aboutDropMenu.addEventListener('click', (e) => e.stopPropagation());
  }

  // ---- MOBILE MENU TOGGLE ----
  const menuToggle = document.getElementById('menuToggle');
  const navLinks = document.getElementById('navLinks');

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      const spans = menuToggle.querySelectorAll('span');
      if (navLinks.classList.contains('open')) {
        spans[0].style.transform = 'translateY(8px) rotate(45deg)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'translateY(-8px) rotate(-45deg)';
      } else {
        spans[0].style.transform = '';
        spans[1].style.opacity = '';
        spans[2].style.transform = '';
      }
    });

    // Close menu when clicking a link
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        const spans = menuToggle.querySelectorAll('span');
        spans[0].style.transform = '';
        spans[1].style.opacity = '';
        spans[2].style.transform = '';
      });
    });
  }

})();
