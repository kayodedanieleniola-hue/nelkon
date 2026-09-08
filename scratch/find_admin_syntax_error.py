import re

path = r"c:\Users\Duke AI\Desktop\NAKCONEL\templates\admin.html"

with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

brace_stack = []
paren_stack = []

for line_num, line in enumerate(lines, 1):
    for char_num, ch in enumerate(line, 1):
        if ch == '{':
            brace_stack.append((line_num, char_num))
        elif ch == '}':
            if brace_stack:
                brace_stack.pop()
            else:
                print(f"UNMATCHED CLOSING BRACE '}}' at line {line_num}, col {char_num}")
        elif ch == '(':
            paren_stack.append((line_num, char_num))
        elif ch == ')':
            if paren_stack:
                paren_stack.pop()
            else:
                print(f"UNMATCHED CLOSING PAREN ')' at line {line_num}, col {char_num}")

if brace_stack:
    print(f"UNCLOSED BRACES: {len(brace_stack)} starting at lines: {[l for l, c in brace_stack[:5]]}")
if paren_stack:
    print(f"UNCLOSED PARENS: {len(paren_stack)} starting at lines: {[l for l, c in paren_stack[:5]]}")
