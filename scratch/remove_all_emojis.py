import os
import re

# Specific set of emojis to remove
emoji_chars = [
    "🎨", "📅", "🤖", "✨", "🔒", "⚡", "📎", "🛡️", "➕", "📥", "💬", "👤", "📊",
    "⚙️", "🔴", "🟢", "🚀", "💡", "💳", "🗑️", "✏️", "👁️", "⭐", "🚫", "⏳"
]

root_dir = r"c:\Users\Duke AI\Desktop\NAKCONEL"
files_to_clean = []

for folder in ["templates"]:
    fp = os.path.join(root_dir, folder)
    if os.path.exists(fp):
        for f in os.listdir(fp):
            if f.endswith(".html"):
                files_to_clean.append(os.path.join(fp, f))

files_to_clean.append(os.path.join(root_dir, "app.py"))

cleaned_count = 0
for filepath in files_to_clean:
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
    
    original = content
    for ch in emoji_chars:
        content = content.replace(ch, "")
    
    # Clean up double spaces created by emoji removals in text nodes
    content = re.sub(r' +', ' ', content)
    
    if content != original:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        cleaned_count += 1
        print(f"Cleaned emojis in: {os.path.relpath(filepath, root_dir)}")

print(f"Total files cleaned: {cleaned_count}")
