"""合成 3 张 1920x960 插件介绍图：功能亮点 + 界面截图风格"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "发布材料")
ASSETS = os.path.join(OUT_DIR, "assets")
os.makedirs(ASSETS, exist_ok=True)

SHOT_LIST = os.path.join(ASSETS, "shot-list.png")
SHOT_RESULT = os.path.join(ASSETS, "shot-result.png")

FONT_DIR = r"C:\Users\Administrator\AppData\Roaming\kimi-desktop\daimon-share\daimon\runtime\python\fonts"
REG = os.path.join(FONT_DIR, "NotoSansCJKsc-Regular.otf")
BOLD = os.path.join(FONT_DIR, "NotoSansCJKsc-Bold.otf")

W, H = 1920, 960


def font(path, size):
    return ImageFont.truetype(path, size)


def overlay(img):
    """新建一个透明叠加层，绘制后调用 composite 回来"""
    return Image.new("RGBA", img.size, (0, 0, 0, 0))


def gradient_bg(c1=(11, 52, 196), c2=(56, 116, 250)):
    """对角渐变背景 + 装饰圆"""
    x = np.linspace(0, 1, W)[None, :]
    y = np.linspace(0, 1, H)[:, None]
    t = np.clip((x + y) / 2, 0, 1)
    arr = np.zeros((H, W, 3), dtype=np.uint8)
    for i in range(3):
        arr[..., i] = (c1[i] * (1 - t) + c2[i] * t).astype(np.uint8)
    img = Image.fromarray(arr, "RGB").convert("RGBA")
    deco = overlay(img)
    d = ImageDraw.Draw(deco)
    d.ellipse([1450, -260, 2150, 440], outline=(255, 255, 255, 40), width=3)
    d.ellipse([1560, -150, 2040, 330], outline=(255, 255, 255, 28), width=3)
    d.ellipse([-260, 640, 340, 1240], outline=(255, 255, 255, 28), width=3)
    d.ellipse([-160, 740, 240, 1140], outline=(255, 255, 255, 20), width=3)
    img.alpha_composite(deco)
    return img


def rounded_card(img, shot_path, box, radius=28, crop_top=1.0):
    """把截图（可顶部裁切）以圆角卡片 + 阴影贴到 box=(x, y, w, h)"""
    x, y, w, h = box
    shot = Image.open(shot_path).convert("RGBA")
    if crop_top < 1.0:
        shot = shot.crop((0, 0, shot.width, int(shot.height * crop_top)))
    shot = shot.resize((w, h), Image.LANCZOS)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w, h], radius=radius, fill=255)
    shadow = Image.new("RGBA", (w + 120, h + 120), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([60, 60, 60 + w, 60 + h], radius=radius, fill=(8, 20, 60, 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    img.alpha_composite(shadow, (x - 60, y - 40))
    img.paste(shot, (x, y), mask)
    edge = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(edge).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, outline=(255, 255, 255, 110), width=2)
    img.alpha_composite(edge, (x, y))


def draw_text_block(img, x, y, title, subtitle, title_size=76, sub_size=32):
    """标题（不透明）+ 副标题（半透明，走叠加层）"""
    d = ImageDraw.Draw(img)
    f_title = font(BOLD, title_size)
    f_sub = font(REG, sub_size)
    cy = y
    for line in title.split("\n"):
        d.text((x, cy), line, font=f_title, fill=(255, 255, 255, 255))
        cy += int(title_size * 1.32)
    cy += 20
    layer = overlay(img)
    ld = ImageDraw.Draw(layer)
    for line in subtitle.split("\n"):
        ld.text((x, cy), line, font=f_sub, fill=(255, 255, 255, 215))
        cy += int(sub_size * 1.55)
    img.alpha_composite(layer)
    return cy


def draw_chip(img, x, y, text, size=28):
    """半透明胶囊标签：形状走叠加层，文字不透明"""
    f = font(REG, size)
    pad_x, pad_y = 28, 14
    bbox = f.getbbox(text)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    w, h = tw + pad_x * 2, th + pad_y * 2 + 8
    layer = overlay(img)
    ld = ImageDraw.Draw(layer)
    ld.rounded_rectangle([x, y, x + w, y + h], radius=h // 2, fill=(255, 255, 255, 42), outline=(255, 255, 255, 110), width=2)
    img.alpha_composite(layer)
    ImageDraw.Draw(img).text((x + pad_x, y + pad_y - 2), text, font=f, fill=(255, 255, 255, 255))
    return w, h


def add_brand(img, text="多条记录分享 · Multi Record Share"):
    layer = overlay(img)
    ImageDraw.Draw(layer).text((80, H - 84), text, font=font(REG, 24), fill=(255, 255, 255, 150))
    img.alpha_composite(layer)


# ============ 图 1：主视觉 ============
def image1():
    img = gradient_bg()
    y_end = draw_text_block(
        img, 110, 240,
        "一次勾选，批量分享\n多条记录",
        "批量生成记录分享链接\n粘贴给飞书里有权限的同事",
    )
    cx = 110
    for chip in ("多选记录", "批量生成链接", "一键复制"):
        w, h = draw_chip(img, cx, y_end + 44, chip)
        cx += w + 20
    rounded_card(img, SHOT_LIST, (1150, 90, 620, 780))
    add_brand(img)
    img.convert("RGB").save(os.path.join(OUT_DIR, "介绍图-1-批量分享.png"))


# ============ 图 2：字段组合标题 ============
def image2():
    img = gradient_bg(c1=(18, 38, 160), c2=(46, 99, 246))
    y_end = draw_text_block(
        img, 1090, 270,
        "任意字段，\n自由组合标题",
        "编号 - 问题点 - 项目\n按你需要的方式拼出记录标题",
    )
    cx = 1090
    for chip in ("多选字段", "顺序拼接", "即时预览"):
        w, h = draw_chip(img, cx, y_end + 44, chip)
        cx += w + 20
    rounded_card(img, SHOT_RESULT, (150, 90, 620, 780), crop_top=0.46)
    add_brand(img)
    img.convert("RGB").save(os.path.join(OUT_DIR, "介绍图-2-字段标题.png"))


# ============ 图 3：粘贴效果 ============
def draw_chat_mock(img):
    """右侧绘制飞书聊天消息 mock"""
    bx, by, bw, bh = 1120, 120, 700, 720
    shadow = Image.new("RGBA", (bw + 120, bh + 120), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([60, 60, 60 + bw, 60 + bh], radius=36, fill=(8, 20, 60, 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    img.alpha_composite(shadow, (bx - 60, by - 40))
    bubble = Image.new("RGBA", (bw, bh), (255, 255, 255, 255))
    mask = Image.new("L", (bw, bh), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, bw, bh], radius=36, fill=255)
    img.paste(bubble, (bx, by), mask)

    d = ImageDraw.Draw(img)
    f_head = font(BOLD, 30)
    f_item = font(REG, 28)
    f_link = font(REG, 22)
    f_card = font(REG, 26)

    d.text((bx + 44, by + 36), "来自多维表格数据表「项目跟进表」的 3 条记录分享：",
           font=f_head, fill=(31, 35, 41))
    items = [
        ("1. 1921-官网改版需求评审", "https://feishu.cn/base/QTtUxxxx?record=recA1"),
        ("2. 1923-Q4 产品路线图", "https://feishu.cn/base/QTtUxxxx?record=recA3"),
        ("3. 1925-新增成员入职清单", "https://feishu.cn/base/QTtUxxxx?record=recA5"),
    ]
    cy = by + 112
    for title, link in items:
        d.text((bx + 44, cy), title, font=f_item, fill=(31, 35, 41))
        cy += 44
        d.text((bx + 44, cy), link, font=f_link, fill=(20, 86, 240))
        cy += 58
        card_h = 76
        d.rounded_rectangle([bx + 44, cy, bx + bw - 44, cy + card_h], radius=12, fill=(245, 246, 247))
        d.rounded_rectangle([bx + 64, cy + 18, bx + 104, cy + 58], radius=8, fill=(20, 86, 240))
        d.text((bx + 124, cy + 22), "“项目跟进表”的记录", font=f_card, fill=(31, 35, 41))
        cy += card_h + 26


def image3():
    img = gradient_bg(c1=(10, 66, 210), c2=(64, 140, 255))
    y_end = draw_text_block(
        img, 110, 250,
        "复制粘贴，\n对方即点即看",
        "粘贴到飞书聊天\n记录链接自动渲染为可点击卡片",
    )
    cx = 110
    for chip in ("纯文本 / Markdown", "记录卡片渲染", "权限内访问"):
        w, h = draw_chip(img, cx, y_end + 44, chip)
        cx += w + 20
    draw_chat_mock(img)
    add_brand(img)
    img.convert("RGB").save(os.path.join(OUT_DIR, "介绍图-3-粘贴即达.png"))


if __name__ == "__main__":
    image1()
    image2()
    image3()
    print("done")
