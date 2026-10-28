from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from html import escape
import re

out=Path(__file__).parent
W,H=2200,1810
im=Image.new('RGB',(W,H),'#f5f7fb'); dr=ImageDraw.Draw(im)
fontpath='C:/Windows/Fonts/msyh.ttc'
fonts={n:ImageFont.truetype(fontpath,n) for n in [24,28,30,32,36,44,52]}
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><rect width="100%" height="100%" fill="#f5f7fb"/>']
def text(x,y,s,size=30,color='#203047'):
 dr.text((x,y),s,font=fonts[size],fill=color)
 svg.append(f'<text x="{x}" y="{y+size}" font-family="Microsoft YaHei, sans-serif" font-size="{size}" fill="{color}">{escape(s)}</text>')
def box(x,y,w,h,fill,border='#d6dfec'):
 dr.rounded_rectangle((x,y,x+w,y+h),radius=18,fill=fill,outline=border,width=2)
 svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="{fill}" stroke="{border}" stroke-width="2"/>')
def edge(x1,y1,x2,y2,color):
 cx=(x1+x2)/2
 pts=[]
 for i in range(81):
  t=i/80;u=1-t
  pts.append((u**3*x1+3*u*u*t*cx+3*u*t*t*cx+t**3*x2,u**3*y1+3*u*u*t*y1+3*u*t*t*y2+t**3*y2))
 dr.line(pts,fill=color,width=5)
 svg.append(f'<path d="M{x1},{y1} C{cx},{y1} {cx},{y2} {x2},{y2}" fill="none" stroke="{color}" stroke-width="5"/>')
text(60,35,'九篇基础论文 · 方法与验证进展',52)
text(62,112,'从“训练得动”到“算得省、选得准、关联得远”',30,'#596c84')
groups=[
 ('深层网络训练','怎样让加深有效？',220,'#4574b0','#e6eef9',[
 ('ResNet',220,'核心：残差学习与 shortcut','实现：卷积分支 F(x) + x；尺寸不同时投影','已验证：ImageNet / CIFAR；检测与竞赛')]),
 ('轻量化计算','怎样在预算内表达？',570,'#348579','#e4f2ef',[
 ('MobileNet V1',400,'核心：拆开空间提取与通道混合','实现：DW 3×3 → PW 1×1；宽度 α / 分辨率 ρ','已验证：分类、检测、细粒度与人脸等应用'),
 ('IGC 原版',570,'核心：两级互补分组，保留跨组交流','实现：空间分组 → 交错重排 → 逐点分组','已验证：CIFAR / SVHN / ImageNet；残差结合'),
 ('ShuffleNet V1',740,'核心：继续压低逐点卷积成本','实现：1×1 分组 → shuffle → DW → 1×1 分组','已验证：分类 / COCO 检测；ARM 实际耗时')]),
 ('特征与尺度选择','怎样按输入分配权重？',1175,'#8b63ad','#f0eaf8',[
 ('SE',920,'核心：哪些通道更重要？','实现：GAP → 两层 FC → sigmoid → 通道乘权','已验证：多骨干分类、场景分类与检测'),
 ('ECA',1090,'核心：更少参数实现通道注意力','实现：GAP → 通道轴 Conv1D → sigmoid','已验证：分类、检测与实例分割'),
 ('CBAM',1260,'核心：哪些通道、哪些位置更重要？','实现：通道注意力 → 空间注意力；双池化','已验证：分类、COCO / VOC 检测与可视化'),
 ('SK',1430,'核心：按输入融合不同感受野','实现：多尺度分支 → 分支维 softmax → 加权和','已验证：ImageNet / CIFAR；尺度响应分析')]),
 ('全局序列交互','怎样聚合远距离信息？',1600,'#aa7843','#f8eedf',[
 ('Transformer',1600,'核心：按内容相关性直接聚合不同位置','实现：Q/K/V 多头注意力 + 位置编码 + FFN','已验证：机器翻译、句法分析与消融')])]
for label,question,cy,col,bg,nodes in groups:
 edge(370,910,490,cy,col)
 for name,ny,a,b,c in nodes:edge(820,cy,970,ny,col)
for label,question,cy,col,bg,nodes in groups:
 box(490,cy-57,330,114,bg)
 text(515,cy-42,label,36,col);text(515,cy+13,question,24)
 for name,ny,a,b,c in nodes:
  box(970,ny-78,1170,156,'#ffffff')
  text(995,ny-57,name,36,col)
  text(1330,ny-53,a,30)
  text(995,ny-2,b,28)
  text(995,ny+32,c,28,'#596c84')
box(60,831,310,158,'#203047','#203047')
text(94,858,'九篇基础论文',36,'#ffffff')
text(94,920,'结构 · 方法 · 证据',24,'#dce5f2')
text(62,1730,'口径：进展来自所给论文；不表示当前社区进展或个人复现状态。',28,'#596c84')
text(62,1770,'主题归类不代表严格历史顺序；不同任务与实验设置不作统一排名。',24,'#596c84')
svg.append('</svg>')
im.save(out/'论文思维导图.png')
(out/'论文思维导图.svg').write_text('\n'.join(svg),encoding='utf-8')
report=(out/'论文精读与对比.md').read_text(encoding='utf-8')
m=re.search(r'```mermaid\n(.*?)\n```',report,re.S)
(out/'论文思维导图.mmd').write_text(m.group(1),encoding='utf-8')
print('Created PNG, SVG, Mermaid; report chars:',len(report))

