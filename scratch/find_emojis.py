import os
import sys
import re

sys.stdout.reconfigure(encoding='utf-8')

emoji_pattern = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map symbols
    "\U0001F1E0-\U0001F1FF"  # flags (iOS)
    "\U00002702-\U000027B0"  # Dingbats
    "\U000024C2-\U0001F251"
    "\U0001F900-\U0001F9FF"  # Supplemental Symbols and Pictographs
    "\U0001FA70-\U0001FAFF"  # Symbols and Pictographs Extended-A
    "\U00002600-\U000026FF"  # Miscellaneous Symbols
    "]+",
    flags=re.UNICODE
)

root_dir = r"c:\Users\Duke AI\Desktop\NAKCONEL"
files_to_check = []

for folder in ["templates"]:
    fp = os.path.join(root_dir, folder)
    if os.path.exists(fp):
        for f in os.listdir(fp):
            if f.endswith(".html"):
                files_to_check.append(os.path.join(fp, f))

files_to_check.append(os.path.join(root_dir, "app.py"))

matches = {}
for path in files_to_check:
    rel = os.path.relpath(path, root_dir)
    with open(path, "r", encoding="utf-8", errors="ignore") as file:
        for idx, line in enumerate(file, 1):
            found = emoji_pattern.findall(line)
            if found:
                if rel not in matches:
                    matches[rel] = []
                matches[rel].append((idx, line.strip(), found))

print(f"Found emoji occurrences in {len(matches)} files:")
for rel, list_matches in matches.items():
    print(f"\n--- {rel} ({len(list_matches)} lines) ---")
    for idx, snippet, found in list_matches[:10]:
        print(f"Line {idx}: {found} -> {snippet[:80]}")
    if len(list_matches) > 10:
        print(f"...and {len(list_matches) - 10} more lines.")
