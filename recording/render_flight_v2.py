"""Render exported source geometry and the uncut source camera timeline to MP4."""
import argparse
import json
import math
from pathlib import Path
import subprocess
import time

import moderngl
import numpy as np
from PIL import Image, ImageDraw, ImageFont

parser=argparse.ArgumentParser()
parser.add_argument('scene')
parser.add_argument('output')
parser.add_argument('--font',required=True)
parser.add_argument('--egl',required=True)
parser.add_argument('--sample',type=int)
parser.add_argument('--start',type=int,default=0)
parser.add_argument('--end',type=int)
args=parser.parse_args()
root=Path(args.scene);data=json.loads((root/'scene.json').read_text())
W,H,FPS=data['width'],data['height'],data['fps']
ctx=moderngl.create_standalone_context(backend='egl',libegl=args.egl)
print('Renderer:',ctx.info['GL_RENDERER'],flush=True)

VERTEX='''#version 330
in vec3 in_position;
in vec3 in_normal;
in vec3 in_color;
in vec4 in_m0; in vec4 in_m1; in vec4 in_m2; in vec4 in_m3;
in vec3 in_instance_color;
uniform mat4 projection_view;
uniform mat4 model;
uniform vec3 base_color;
out vec3 normal; out vec3 color; out vec3 world;
void main(){
 mat4 transform=model*mat4(in_m0,in_m1,in_m2,in_m3);
 vec4 p=transform*vec4(in_position,1.0);
 world=p.xyz;
 normal=normalize(transpose(inverse(mat3(transform)))*in_normal);
 color=in_color*in_instance_color*base_color;
 gl_Position=projection_view*p;
}
'''
FRAGMENT='''#version 330
in vec3 normal;in vec3 color;in vec3 world;
uniform vec3 camera_position;
uniform vec3 light_position, sky_color, ground_color, sunlight, background, emissive;
uniform float light_power, ambient_power, unlit;
uniform float roughness;
uniform float opacity;
out vec4 frag;
vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}
void main(){
 vec3 n=normalize(normal);if(!gl_FrontFacing)n=-n;
 vec3 light=normalize(light_position-world);
 float diffuse=max(dot(n,light),0.0);
 vec3 ambient=mix(ground_color,sky_color,n.y*0.5+0.5);
 vec3 rgb=mix(color*(ambient*ambient_power+sunlight*diffuse*light_power)+emissive,color*2.0,unlit);
 vec3 half_vector=normalize(light+normalize(camera_position-world));
 float highlight=pow(max(dot(n,half_vector),0.0),mix(72.0,8.0,roughness))*(1.0-roughness)*0.12;
 rgb+=highlight;
 rgb=pow(aces(rgb*1.03),vec3(1.0/2.2));
 float fog=clamp((length(camera_position-world)-135.0)/105.0,0.0,1.0);
 frag=vec4(mix(rgb,background,fog),opacity);
}
'''
program=ctx.program(vertex_shader=VERTEX,fragment_shader=FRAGMENT)
fbo=ctx.simple_framebuffer((W,H),components=3,samples=4)
resolved=ctx.simple_framebuffer((W,H),components=3)
ctx.enable(moderngl.DEPTH_TEST|moderngl.BLEND)
ctx.blend_func=moderngl.SRC_ALPHA,moderngl.ONE_MINUS_SRC_ALPHA
identity=np.eye(4,dtype='f4').T.copy()
default_instance=np.concatenate([identity.ravel(),np.ones(3,dtype='f4')])
default_buffer=ctx.buffer(default_instance.tobytes())
geometries=[]
for g in data['geometries']:
 pos=np.fromfile(root/g['position'],dtype='f4').reshape(-1,3)
 normal=np.fromfile(root/g['normal'],dtype='f4').reshape(-1,3) if 'normal' in g else np.tile([0,1,0],(len(pos),1))
 color=np.fromfile(root/g['color'],dtype='f4').reshape(-1,3) if 'color' in g else np.ones_like(pos)
 buf=ctx.buffer(np.column_stack([pos,normal,color]).astype('f4').tobytes())
 ib=ctx.buffer((root/g['index']).read_bytes()) if 'index' in g else None
 geometries.append((buf,ib))
objects=[]
for item in data['objects']:
 geom=geometries[item['geometry']]
 if 'instances' in item:
  matrices=np.fromfile(root/item['instances'],dtype='f4').reshape(-1,16)
  colors=np.fromfile(root/item['instanceColors'],dtype='f4').reshape(-1,3) if 'instanceColors' in item else np.ones((len(matrices),3))
  ins=ctx.buffer(np.column_stack([matrices,colors]).astype('f4').tobytes())
 else:ins=default_buffer
 vao=ctx.vertex_array(program,[(geom[0],'3f 3f 3f','in_position','in_normal','in_color'),(ins,'4f 4f 4f 4f 3f /i','in_m0','in_m1','in_m2','in_m3','in_instance_color')],index_buffer=geom[1],index_element_size=4)
 item['vao']=vao;item['model']=np.array(item['matrix'],dtype='f4').reshape(4,4).T
 item['mode_value']={'triangles':moderngl.TRIANGLES,'lines':moderngl.LINES,'line_strip':moderngl.LINE_STRIP,'points':moderngl.POINTS}[item['mode']]
 objects.append(item)
cameras=np.fromfile(root/'cameras.bin',dtype='f4').reshape(-1,19)
motion=np.fromfile(root/'motion.bin',dtype='f4').reshape(-1,data['motionCount'],4,4)

fonts={n:ImageFont.truetype(args.font,n) for n in [10,11,12,13,14,15,16,18,20,22,24,27,30,40,42]}
ink='#254b43';muted='#6e8379';accent='#28776c';glass=(253,255,251,248);border=(65,97,80,35)

def text(draw,xy,s,size=14,fill=ink,anchor=None):
 draw.text(xy,s,font=fonts[size],fill=fill,anchor=anchor,stroke_width=0)

def rounded(draw,box,r=12,fill=glass,outline=border):
 draw.rounded_rectangle(box,radius=r,fill=fill,outline=outline,width=1)

def wrap(s,font,width):
 lines=[];line=''
 for c in s:
  if font.getlength(line+c)>width and line:lines.append(line);line=c
  else:line+=c
 if line:lines.append(line)
 return lines

static=Image.new('RGBA',(W,H));dr=ImageDraw.Draw(static)
rounded(dr,(24,20,320,154),12,(253,255,251,240),None)
text(dr,(38,28),'SOUTH KOREA  ·  SPATIAL ATLAS',12,accent)
text(dr,(36,47),'서울',42);text(dr,(133,70),'SEOUL',20);text(dr,(225,71),'3D',13,accent);text(dr,(255,71),'V2',12,muted)
text(dr,(38,118),'한강을 따라, 도시 너머로.',14,muted)
rounded(dr,(W-293,32,W-78,79),11)
rounded(dr,(W-288,37,W-229,74),7,accent,accent);text(dr,(W-259,53),'☀ 낮',14,'white','mm')
text(dr,(W-190,53),'◒ 노을',14,muted,'mm');text(dr,(W-117,53),'야경',14,muted,'mm')
rounded(dr,(W-67,32,W-20,79),11);text(dr,(W-44,54),'i',20,ink,'mm')
rounded(dr,(32,178,282,H-77),16)
text(dr,(48,195),'어디로 가볼까요?',16)
rounded(dr,(48,234,266,299),8,(234,240,230,170),None)
text(dr,(59,240),'서울 25개 자치구',12,muted);text(dr,(59,265),'자치구로 이동',14);dr.line([(246,277),(250,281),(254,277)],fill=muted,width=1)
text(dr,(54,318),'LANDMARKS',12,muted);text(dr,(235,318),'21곳',12,muted)
for i,p in enumerate(data['places'][:4]):
 y=349+i*58
 rounded(dr,(56,y+8,80,y+34),4,(255,255,255,0),(120,155,133,65));text(dr,(68,y+19),f'{i+1:02}',11,muted,'mm')
 text(dr,(90,y),p['name'],14);text(dr,(90,y+23),p['en'],11,muted);text(dr,(250,y+14),'↗',14,muted)
dr.line((48,H-119,266,H-119),fill=(70,110,85,50),width=1)
text(dr,(68,H-110),'서울 자치구 경계',11,muted);dr.line((50,H-99,61,H-99),fill='#b79b64',width=2);text(dr,(235,H-110),'표시',11,accent)
rounded(dr,(W-77,H-318,W-34,H-236),9);text(dr,(W-55,H-299),'+',24,ink,'mm');dr.line((W-76,H-277,W-35,H-277),fill=border);text(dr,(W-55,H-256),'−',24,ink,'mm')
text(dr,(W-55,H-367),'N',12,accent,'mm');dr.polygon([(W-55,H-349),(W-45,H-319),(W-55,H-326),(W-65,H-319)],fill=accent)
text(dr,(32,H-24),'실제 지도 기반 · 높이 4×',11,muted);text(dr,(W-32,H-24),'지도 데이터·모형 안내',11,muted,'ra')
tool_x=(W-450)//2;tool_y=H-115
rounded(dr,(tool_x,tool_y,tool_x+450,tool_y+75),13)
for j,(icon,title) in enumerate([('⌂','서울 전체'),('Ⅱ','비행 멈춤'),('◇','평면 보기'),('⌖','지명'),('⛶','전체 화면')]):
 x=tool_x+45+j*90
 if j in [1,3]:rounded(dr,(x-39,tool_y+5,x+39,tool_y+69),8,accent,None)
 fill='white' if j in [1,3] else ink
 cy=tool_y+21
 if j==0:
  dr.line([(x-10,cy),(x,cy-9),(x+10,cy)],fill=fill,width=2);dr.line([(x-7,cy-2),(x-7,cy+10),(x+7,cy+10),(x+7,cy-2)],fill=fill,width=2)
 elif j==1:
  dr.rectangle((x-5,cy-7,x-2,cy+8),fill=fill);dr.rectangle((x+2,cy-7,x+5,cy+8),fill=fill)
 elif j==2:
  dr.line([(x-10,cy-2),(x,cy-8),(x+10,cy-2),(x,cy+4),(x-10,cy-2)],fill=fill,width=2);dr.line([(x-10,cy+4),(x,cy+10),(x+10,cy+4)],fill=fill,width=2)
 elif j==3:
  dr.ellipse((x-7,cy-9,x+7,cy+5),outline=fill,width=2);dr.line([(x-6,cy+2),(x,cy+11),(x+6,cy+2)],fill=fill,width=2);dr.ellipse((x-2,cy-4,x+2,cy),outline=fill,width=1)
 else:
  for a,b in [(-1,-1),(1,-1),(-1,1),(1,1)]:dr.line([(x+a*4,cy+b*9),(x+a*9,cy+b*9),(x+a*9,cy+b*4)],fill=fill,width=2)
 text(dr,(x,tool_y+51),title,12,fill,'mm')
text(dr,(W/2,H-140),'VERSION 2  ·  랜덤 시간대  ·  줌 & 오비트',12,muted,'mm')

cards=[]
for i in range(-1,len(data['places'])):
 card=Image.new('RGBA',(253,185));c=ImageDraw.Draw(card);rounded(c,(0,0,252,184),13)
 if i<0:name,en,description,ll='서울, 한눈에','A CITY IN MINIATURE','한강과 산, 그 사이에 펼쳐진 25개 자치구',[126.978,37.5665]
 else:p=data['places'][i];name,en,description,ll=p['name'],p['en'].upper(),p['description'],p['ll']
 en_lines=wrap(en,fonts[11],215)
 for k,line in enumerate(en_lines[:2]):text(c,(18,14+k*16),line,11,muted)
 title_y=49 if len(en_lines)>1 else 38
 size=22 if fonts[22].getlength(name)<218 else 18
 text(c,(18,title_y),name,size)
 for k,line in enumerate(wrap(description,fonts[13],215)[:3]):text(c,(18,title_y+36+k*20),line,13,muted)
 text(c,(18,160),f'{ll[1]:.4f}° N   {ll[0]:.4f}° E',11,muted)
 cards.append(card)

def overlay(frame,vp):
 state=data['frames'][frame];sel=state['selected'];img=Image.new('RGBA',(W,H));draw=ImageDraw.Draw(img)
 occupied=[]
 labels=sorted(data['labels'],key=lambda l:100 if l['place']==sel and sel>=0 else 10 if l['major'] else 0,reverse=True)
 for lab in labels:
  p=vp@np.array(lab['position']+[1]);x=(p[0]/p[3]*.5+.5)*W;y=(-p[1]/p[3]*.5+.5)*H
  if not ((state['zoom']>2.5 or lab['major'] or lab['place']==sel) and -1<p[2]/p[3]<1 and 35<x<W-35 and 110<y<H-150):continue
  if (x<=295 and y>145) or (x>W-300 and y<100):continue
  if any(abs(x-a)<128 and abs((y-31)-b)<38 for a,b in occupied):continue
  occupied.append((x,y-31));chosen=lab['place']==sel and sel>=0;water=lab['place']<0
  size=14 if water else 12;label=lab['name'];w=fonts[size].getlength(label)+22+(0 if water else 10);h=33
  box=(int(x-w/2),int(y-h),int(x+w/2),int(y))
  fill='#246782' if water else accent if chosen else (255,255,248,240)
  rounded(draw,box,6,fill,(84,120,94,50))
  text(draw,(box[0]+11+(0 if water else 10),box[1]+6),label,size,'#eaf9ff' if water else 'white' if chosen else '#426657')
  if not water:draw.ellipse((box[0]+11,box[1]+15,box[0]+14,box[1]+18),fill='white' if chosen else '#659777');draw.line((int(x),int(y),int(x),int(y+6)),fill='#7e9a83')
 img.alpha_composite(static)
 img.alpha_composite(cards[sel+1],(W-285,H-72-185))
 draw=ImageDraw.Draw(img)
 active=state['lightTo'] if state['blend']>.5 else state['lightFrom']
 rounded(draw,(W-293,32,W-78,79),11)
 for j,(key,label) in enumerate([('day','낮'),('sunset','노을'),('night','밤')]):
  x=W-288+j*70
  if key==active:rounded(draw,(x,37,x+65,74),7,accent,accent)
  text(draw,(x+32,53),label,14,'white' if key==active else muted,'mm')
 if 0<=sel<4:
  y=349+sel*58;rounded(draw,(49,y-3,265,y+50),8,(217,234,222,242),None);p=data['places'][sel]
  text(draw,(56,y+12),f'{sel+1:02}',11,muted);text(draw,(90,y),p['name'],14,accent);text(draw,(90,y+23),p['en'],11,muted);text(draw,(250,y+14),'↗',14,accent)
 if state['touring']:
  draw.rounded_rectangle((tool_x+5,tool_y+71,tool_x+5+440*min(1,state['progress']),tool_y+74),2,fill=accent)
 else:
  x=tool_x+135;rounded(draw,(x-39,tool_y+5,x+39,tool_y+69),8,glass,None);text(draw,(x,tool_y+21),'▷',22,ink,'mm');text(draw,(x,tool_y+51),'자동 비행',12,ink,'mm')
 return img

LIGHTS={
 'day':dict(light_position=[-25,42,12],sky_color=[.72,.80,.88],ground_color=[.48,.55,.43],sunlight=[1,.93,.80],background=[230/255,237/255,231/255],light_power=.63,ambient_power=.92),
 'sunset':dict(light_position=[-42,16,14],sky_color=[.70,.39,.33],ground_color=[.37,.30,.25],sunlight=[1,.43,.16],background=[235/255,215/255,198/255],light_power=1.05,ambient_power=.76),
 'night':dict(light_position=[-22,38,-24],sky_color=[.16,.25,.40],ground_color=[.025,.05,.07],sunlight=[.32,.48,.75],background=[19/255,38/255,51/255],light_power=.28,ambient_power=.45)}
def blend_value(a,b,t):
 return tuple(x+(y-x)*t for x,y in zip(a,b)) if isinstance(a,list) else a+(b-a)*t

def render(frame):
 state=data['frames'][frame];vp=cameras[frame,:16].reshape(4,4).T
 a,b,t=state['lightFrom'],state['lightTo'],state['blend']
 lighting={k:blend_value(LIGHTS[a][k],LIGHTS[b][k],t) for k in LIGHTS[a]}
 fbo.use();fbo.clear(*lighting['background'],1,depth=1)
 for k,v in lighting.items():program[k].value=v
 program['projection_view'].write(cameras[frame,:16].tobytes());program['camera_position'].value=tuple(cameras[frame,16:])
 planes=np.array([vp[3]+vp[0],vp[3]-vp[0],vp[3]+vp[1],vp[3]-vp[1],vp[3]+vp[2],vp[3]-vp[2]])
 planes/=np.linalg.norm(planes[:,:3],axis=1)[:,None]
 for item in objects:
  pa,pb=item['palette'][a],item['palette'][b]
  visibility=blend_value(float(pa['visible']),float(pb['visible']),t)
  if visibility<.01:continue
  if item.get('bounds'):
   bounds=item['bounds'];c=np.array(bounds['center']);
   if np.any(planes[:,:3]@c+planes[:,3]<-bounds['radius']):continue
  model=item['model']
  if item['motion']>=0:model=motion[frame,item['motion']].T@model
  program['model'].write(model.T.astype('f4').tobytes());program['base_color'].value=blend_value(pa['color'],pb['color'],t);program['roughness'].value=item['roughness'];program['opacity'].value=item['opacity']*visibility
  program['emissive'].value=blend_value(pa['emissive'],pb['emissive'],t)
  program['unlit'].value=1.0 if item['mode']=='points' else 0.0
  ctx.point_size=item.get('pointSize',1)
  count=(item['fullCount'] if state['zoom']>1.7 else item['overviewCount']) if 'instances' in item else 1
  item['vao'].render(mode=item['mode_value'],instances=count)
 ctx.copy_framebuffer(resolved,fbo)
 rgb=Image.frombytes('RGB',(W,H),resolved.read(components=3,alignment=1)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
 ui=overlay(frame,vp);rgb.paste(ui,(0,0),ui)
 return rgb

if args.sample is not None:
 start=time.monotonic();render(args.sample).save(args.output);print('Sample render seconds',round(time.monotonic()-start,3),flush=True)
else:
 command=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',args.output]
 encoder=subprocess.Popen(command,stdin=subprocess.PIPE)
 start=time.monotonic()
 try:
  for i in range(args.start,args.end or len(data['frames'])):
   encoder.stdin.write(render(i).tobytes())
   if i%120==0:
    elapsed=time.monotonic()-start;print(json.dumps({'frame':i,'total':len(data['frames']),'percent':round(i/len(data['frames'])*100,1),'elapsedSeconds':round(elapsed),'renderFPS':round((i+1)/elapsed,1),'place':data['places'][data['frames'][i]['selected']]['name'] if data['frames'][i]['selected']>=0 else '서울 전체'}),flush=True)
 finally:encoder.stdin.close()
 assert encoder.wait()==0,'Video encoder failed'
 print('Video complete',Path(args.output).stat().st_size,'bytes',flush=True)
