path = 'templates/home.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the now-unused first-child override
content = content.replace(
    '\n  .pillar-row:first-child .pillar-img-frame { min-height: 560px; }',
    ''
)

# Add campaign-block CSS after .explore-btn:hover rule
insert_after = '.explore-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(201,154,74,0.35); color: var(--wine-deep); }'
new_css = '''\n.campaign-block { border: 1px solid var(--border); border-radius: var(--r); overflow: hidden; background: var(--card); backdrop-filter: blur(8px); transition: border-color 0.4s ease; }
.campaign-block:hover { border-color: rgba(201,154,74,0.35); }
.campaign-full-img { width: 100%; height: auto; display: block; }
.campaign-info { padding: 48px; display: flex; flex-direction: column; gap: 20px; }
.campaign-info h3 { font-family: 'Agrandir', sans-serif; font-size: 24px; font-weight: 800; color: var(--white); }
.campaign-info p { color: var(--muted); font-size: 15px; line-height: 1.6; }'''

if insert_after in content:
    content = content.replace(insert_after, insert_after + new_css)
    print('CSS inserted')
else:
    print('CSS anchor not found')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
