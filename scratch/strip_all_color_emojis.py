import os
import re

root_dir = r"c:\Users\Duke AI\Desktop\NAKCONEL"
files_to_clean = []

for folder in ["templates", "static"]:
    fp = os.path.join(root_dir, folder)
    if os.path.exists(fp):
        for root, dirs, files in os.walk(fp):
            for f in files:
                if f.endswith((".html", ".js", ".css")):
                    files_to_clean.append(os.path.join(root, f))

files_to_clean.append(os.path.join(root_dir, "app.py"))

emoji_regex = re.compile(
    r'[\U0001F300-\U0001F9FF'
    r'\U0001FA00-\U0001FA6F'
    r'\U0001FA70-\U0001FAFF'
    r'\u2600-\u26FF'
    r'\u2702-\u2712'
    r'\u2714-\u2714'
    r'\u2716-\u27BF]'
)

cleaned_files = 0
for filepath in files_to_clean:
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
    
    new_content = emoji_regex.sub('', content)
    
    if new_content != content:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        cleaned_files += 1
        print(f"Removed emojis from: {os.path.relpath(filepath, root_dir)}")

print(f"Done! Cleaned emojis in {cleaned_files} files.")
