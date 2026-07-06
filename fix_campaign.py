path = 'templates/home.html'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print('Total lines:', len(lines))
print('Line 497:', repr(lines[496]))

new_block = [
    '  <div class="campaign-block">\n',
    '    <img src="/static/image/activation-campaign.jpeg" alt="Nakconel Future Brand Movement Activation Campaign" class="campaign-full-img">\n',
    '    <div class="campaign-info">\n',
    '      <span class="campaign-badge">Brand Activation Campaign</span>\n',
    '      <h3>Brand Activation Campaign</h3>\n',
    '      <p>Your appearance is your first communication. Book a brand intelligence consultation, share your business challenge, and receive personalized AI tools, brand strategy, and content direction \u2014 plus limited Nakconel merch when you qualify.</p>\n',
    '      <a href="/campaign" class="explore-btn">Explore It \u2197</a>\n',
    '    </div>\n',
    '  </div>\n',
]

# Find the pillars-stack block (first one, the activation campaign one)
start = None
for i, l in enumerate(lines):
    if '<div class="pillars-stack">' in l and start is None:
        start = i
        break

if start is None:
    print('ERROR: pillars-stack not found')
else:
    # find closing </div> of pillars-stack (depth tracking)
    depth = 0
    end = start
    for i in range(start, len(lines)):
        depth += lines[i].count('<div')
        depth -= lines[i].count('</div>')
        if depth == 0:
            end = i
            break
    print(f'Block: lines {start+1} to {end+1}')
    result = lines[:start] + new_block + lines[end+1:]
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(result)
    print('Done. New total:', len(result))
