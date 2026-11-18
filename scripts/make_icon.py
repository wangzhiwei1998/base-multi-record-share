"""生成插件图标：128x128 PNG（先用 512 画布抗锯齿）+ SVG 版本"""
import os

from PIL import Image, ImageDraw

os.makedirs("发布材料", exist_ok=True)

S = 512
OUT = 128
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 圆角方形底色（飞书 B500）
BLUE = (20, 86, 240, 255)
radius = 112
d.rounded_rectangle([0, 0, S, S], radius=radius, fill=BLUE)

# 白色「分享」图形：三个圆点 + 两条连线
WHITE = (255, 255, 255, 255)
r = 46
left = (140, 300)
tr = (370, 150)
br = (370, 350)
lw = 30
d.line([left, tr], fill=WHITE, width=lw)
d.line([left, br], fill=WHITE, width=lw)
for cx, cy in (left, tr, br):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)

img = img.resize((OUT, OUT), Image.LANCZOS)
img.save(r"发布材料/icon-128.png")

svg = """<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#1456F0"/>
  <g stroke="#FFFFFF" stroke-width="7.5" stroke-linecap="round">
    <line x1="35" y1="75" x2="92.5" y2="37.5"/>
    <line x1="35" y1="75" x2="92.5" y2="87.5"/>
  </g>
  <g fill="#FFFFFF">
    <circle cx="35" cy="75" r="11.5"/>
    <circle cx="92.5" cy="37.5" r="11.5"/>
    <circle cx="92.5" cy="87.5" r="11.5"/>
  </g>
</svg>
"""
with open(r"发布材料/icon.svg", "w", encoding="utf-8") as f:
    f.write(svg)
print("done")
