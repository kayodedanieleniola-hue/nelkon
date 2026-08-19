import re

with open('templates/career.html', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r'<section class="camp-hero" id="hero">[\s\S]*?<div class="scroll-cue" id="scrollCue">'
replacement = '''<section class="camp-hero" id="hero">
  <img class="hero-video-bg" id="heroVideo" src="/static/image/career-hero.jpg" alt="Nakconel Career Store Hero">
  <div class="hero-video-overlay"></div>
  <div class="camp-hero-cont">
    <div class="camp-hero-txt" id="heroTxt">
      <span class="camp-badge">Nakconel Career Store</span>
      <h1>Build Your <span class="accent">Career</span> With Us</h1>
      <p class="camp-hero-sub">TRAINING &bull; MENTORSHIP &bull; REAL CLIENT WORK</p>
      <p class="lead">Gain job-ready skills through hands-on training, then step directly into real client projects with our team.</p>
      <div class="camp-hero-btns">
        <a href="#training" class="hero-cta">Explore Tracks ↗</a>
        <a href="/internship-application" class="sec-btn">Apply for Internship</a>
      </div>
    </div>
  </div>
  <div class="scroll-cue" id="scrollCue">'''

new_content = re.sub(pattern, replacement, content, count=1)

# Also update registration links
new_content = new_content.replace('/register?next=/campaign-form', '/training-registration')
new_content = new_content.replace('href="/campaign-form" class="sec-btn">Internship Registration', 'href="/internship-application" class="sec-btn">Internship Registration')

with open('templates/career.html', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Updated career.html successfully!')
