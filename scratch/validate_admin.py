import re

path = r"c:\Users\Duke AI\Desktop\NAKCONEL\templates\admin.html"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Extract all <script> contents
scripts = re.findall(r'<script.*?>(.*?)</script>', content, re.DOTALL)
print(f"Found {len(scripts)} script tags in admin.html.")

for idx, script in enumerate(scripts, 1):
    open_b = script.count('{')
    close_b = script.count('}')
    open_p = script.count('(')
    close_p = script.count(')')
    print(f"Script {idx}: Braces open={open_b}, close={close_b} | Parens open={open_p}, close={close_p}")

print("Validation complete.")
