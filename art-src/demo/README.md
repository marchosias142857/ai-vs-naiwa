# Demo 美术来源与制作记录

## 当前：参考图 2 的反应动作（2026-10-24）

- `da-fei-yu-pixel-v2.png` 原样使用负责人最新 `(3)` / `(4)` 附件，SHA-256 为 `5c4403dc7535f67f21ccef0da864e4042aaff4f24fcc68af90f0e9c9437731f7`；待机、行走没有重绘。
- `da-fei-yu-pixel-reactions-v1.png`：内置 imagegen 根据同一角色新增 2 帧受击和 4 帧死亡，3×2 等分格，每格 512×512；手臂不露肤色手，武器依旧独立。按角色头身比例设置反应缩放，脚底地面一致。图像保留生成 alpha，运行时 NEAREST 采样并对齐画布像素。
- 原 `da-fei-yu-reactions.png` 的细节风格与新参考不同，已从运行资源移除；它只在 git 历史保留。本轮新要求取代此前保留旧受击/死亡的决定。
- 使用范围延续负责人授权的本项目素材制作与随仓库分发，不另行主张参考图权属。完整生成与修订提示见 [reference-reactions-prompt.md](reference-reactions-prompt.md)。

## PR #83：历史方向（2026-10-24）

- 负责人最终选择按两张《元气骑士》参考图的粗颗粒像素密度制作大肥鱼，约 24–32 原生像素高；这些图只用于密度与风格参考，不进入游戏资源。蓝发、白帽、围裙和鱼尾身份来自负责人此前提供的角色图。
- `da-fei-yu.png`：6 帧上下摆尾待机、8 帧交替行走；身体不画手。使用负责人本轮补发的透明版 `大肥鱼动作帧(1).png` 原文件，已替换上一轮本地残留的带光晕候选稿；运行时按矩形帧读取并使用 NEAREST 采样。
- `da-fei-yu-reactions.png`：原样复制负责人上传的 `Sprite Sheet Sleeve Cleanup(1).png`，只使用原受击 2 帧、死亡 4 帧；本轮未重绘。未使用的旧待机、行走也未修改源文件。
- `weapons.png`：使用负责人本轮补发的 `武器图片.png` 原文件，12 件武器的手均为单色长方形，无手指、关节；手属于武器图层，随武器翻面与旋转。按该图重新校准手块中心，并扩展裁切边界保留枪口、弹匣与刀尖。
- `doors.png`：内置图像工具新制的成对开放 / 锁闭海洋遗迹门框，蓝灰石材、浅色门柱、金色贝壳装饰，透明背景；仅替换门口视觉。
- 负责人已授权引用上传素材、用内置图像工具制作并将选定游戏资源随本仓库提交。此前高细节待机 / 行走候选稿均未采用。下文最初 12 帧制作记录保留作历史。

### 最终角色生成提示

Use case: style-transfer. Asset: production transparent pixel-art playable character atlas for a top-down action game.
Image 1 and image 2 are STYLE AND PIXEL-DENSITY REFERENCES: match their very coarse, intentionally tiny sprite resolution precisely. Image 3 is CHARACTER IDENTITY ONLY; do not copy its high detail or proportions.
Create Da Fei Yu as an extremely cute chibi blue-haired whale maid in the same pixel precision as images1-2: each character body is ONLY about 24 pixels wide x 30 pixels high on a tiny native pixel grid, with a short whale tail reaching 8 pixels to the right. Render enlarged with nearest-neighbor hard square blocks. One apparent pixel is large and unmistakably square. Thick one-pixel near-black outlines; only 12-16 flat colors; no subpixel detail, no smooth gradients, no anti-aliasing. Face is a pale simple rectangle, two little vertical blue eye marks of 1x2 pixels, tiny pink 1px mouth, optional 1px cheeks. Oversized round blocky blue head, tiny squat navy maid dress, simple white apron and white maid cap, very short legs and two stubby dark shoes. Hair is two large blue masses, no hair strands. Tiny low-resolution whale-tail silhouette on right. Make it sweet, friendly and adorable.
NO HANDS ANYWHERE on body, no exposed skin except face, no skirt-holding hand, no visible fingers, no weapons or props. Dark sleeves can end flush with torso with no hand. Weapon/rectangular hand will be a separate game layer.
Exactly FOURTEEN distinct frames in a clean 4-column x4-row atlas, with 24px transparent gutters and generous outer border. Same character scale and aligned body centers in every cell. Row1 idle0 idle1 idle2 idle3; row2 idle4 idle5 EMPTY EMPTY; row3 walk0 walk1 walk2 walk3; row4 walk4 walk5 walk6 walk7. Every sprite fully inside cell, no tail or head clipped.
Idle animation: BODY, FACE AND FEET STAY STILL. ONLY whale tail moves visibly UP AND DOWN. Tail y offsets over the six frames are neutral, UP2 tiny-pixels, UP4, neutral, DOWN3, DOWN1; keep tail rooted at hip. This is a continuous wag loop, not a breathing or blink animation.
Walk: clear 8-frame alternating foot cycle: left foot forward, left contact, feet passing, right foot rising, right foot forward, right contact, feet passing, left foot rising. Short cute steps with at most 1-pixel body bob; tail follows gently.
Use no text, no labels, no grid lines, no floor or shadows. Actual transparent PNG alpha. Keep large coarse pixels matching the two style references, NOT a detailed anime illustration.

### 透明背景整理提示

Use case: background-extraction. Edit the attached 14-frame coarse pixel-art sprite sheet. REMOVE ALL smoky blue/grey background, haze, halos and lighting around and between the characters. Empty space including gaps inside silhouettes must be genuinely 100% transparent alpha=0. The actual sprites must be fully opaque alpha=255, with clean hard square pixel silhouette boundaries. Preserve the existing sprite artwork exactly: same coarse pixel resolution, faces, tiny shoes, tail positions, colors, dimensions and arrangement. Do not redesign or move any sprite. No shadow outside silhouette, no glow, no new background, no checkerboard drawn into image. Keep all 14 fully separated frames and the two empty cells. Transparent PNG asset, ready for game atlas.

### 武器手块修改提示

Use case: precise-object-edit. Edit target is the attached 12-weapon transparent atlas. Change ONLY the peach-colored hand shape attached to each of the twelve weapon grips. Each hand must become ONE SMALL SOLID PEACH RECTANGLE with straight horizontal and vertical edges and four square corners, approximately 24px wide x28px high in this atlas. Absolutely no fingers, thumbs, knuckles, rounded corners, polygonal fists, skin shading, gradients, or separate arm. Keep each rectangle centered at the existing hand center so weapon grip metadata stays valid. Preserve the navy cuff behind it. Preserve ALL weapon designs, colors, outlines, dimensions, exact positions, source canvas size, empty space and 4 columns x3 rows layout. Do not move, scale, redraw or add any weapon. Transparent alpha background retained, no labels or grids.

### 本轮附件校验

两份附件均原样接入，没有再次生成或改绘。SHA-256：

- `da-fei-yu.png`：`5c4403dc7535f67f21ccef0da864e4042aaff4f24fcc68af90f0e9c9437731f7`
- `weapons.png`：`552f6b4b4e9477b9f83f983a3c835314550d68d14202b81cf12016cee58c3793`

## 来源与使用范围（首次制作历史）

- 负责人上传的大肥鱼动作帧（参考原图不随仓库发布），仅用于本项目角色身份与动作参考，未另行主张其权属或对外再许可。
- `public/assets/demo/*.png`：GPT 在本轮为《AI 大战奶蛙》使用 OpenAI 图像生成工具新制的真实 PNG。无网络下载或第三方素材；武器、敌人、环境及主菜单构图为本项目原创生成，不使用现有作品角色。生成资源供本项目商用、修改及随游戏分发。
- 保留生成图原始像素；图集使用命名矩形帧，不在运行时复制像素。主角 viewer-right 的手已从身体帧移除，另一只手保持提裙；握武器的手在武器图片中。
- 当前肩膀 / 持握点与时长由 GPT 暂定，见 `src/data/art.ts`。负责人提供精确帧信息后只需替换数据。角色空白图集格不会参与动画。
- 2026-10-24 修订：武器握把上的手统一改成单色桃色块状手套，去掉手指、指节、指甲和肤色渐变，缩小至原约三分之二；深蓝袖口也简化，匹配大肥鱼的大像素画风。使用内置图像工具编辑，保持图集顺序、武器和透明背景。
- 两件近战武器（cutlass、anchor_hammer）已接入锁步命中、动画、反馈与存档。
- 音效全部由项目的 `src/services/Sound.ts` 与 `src/game/fx/CombatAudio.ts` 自行合成（射击、命中、受伤、死亡、奖励、挥动），没有采样第三方音频，也没有外部音乐文件；8 个声部预热复用。

## 提示与修订

### 大肥鱼

以负责人参考图保留角色身份、蓝发鱼尾、白色女仆帽、白裙、深蓝轮廓。透明背景，12 帧：待机 2、跑步 4、受击 2、死亡 4，无文字和格线。身体只保留 viewer-left 提裙手；另一侧不画手，预留独立武器持握。初稿错误地画了两只手，已弃用；第二次编辑要求逐帧移除 viewer-right 的肤色手与前臂，保留其余造型、动作、位置和透明背景。

### 武器

原创海洋遗迹主题像素图集，4 列 × 3 行，各件侧视朝右，握把上自带一只桃色小手和深蓝袖口。顺序为象牙蓝手枪、青色步枪、木质霰弹枪、银色狙击枪、紫色双管冲锋枪、薄荷圆环法杖、红铜连发步枪、金黑重炮、翠绿针枪、紫色扇形法杖、银青弯刀、方形金锤。透明背景、独立完整轮廓，无文字、网格、场景或其他角色。

### 敌人

Create an original commercial game asset sprite atlas for a top-down pixel-art dungeon roguelite called AI VS NAIWA. Transparent background, no letters no labels no shadows outside sprites. 4 columns x 2 rows with wide transparent gutters, seven unique full-body creatures, each entirely separate and not touching. Crisp deliberate pixel art with chunky dark navy outlines, subtle 3-color shading, cute but dangerous. All creatures front-three-quarter view with body centered over feet, no weapons covering face. Row1: 1 round mint-green milk frog with cream belly and two tiny fangs (normal chaser); 2 very small slim turquoise frog with orange sporty crest (fast scout); 3 broad stocky ochre frog inside a navy shell armor with silver rivets (tank); 4 lilac frog with berry cheeks and a little bubble mouth (ranged spitter). Row2: 1 stationary red coral frog turret sitting in an ivory mechanical cup, huge forward-looking eyes (turret); 2 yellow frog with beetle-like helmet and forward-pointing cream horns (charger); 3 large elaborate boss: indigo amphibian monarch with coral crystal crown, layered cream throat, gold ornaments, angry pink eyes, huge powerful arms, body twice as elaborate as others; 4 leave transparent. Each cell 256x256 pixels nominal, creatures sized 160x160 except boss 210x210. Whimsical nautical ruined temple theme, original designs only, do not resemble any existing entertainment character. No scenery, ground plane, typography, grids, borders, or drop shadows. Output real PNG sprite sheet with transparent alpha.

### 环境

Original production videogame environment asset atlas, crisp pixel-art, top-down view for a cozy dark nautical temple dungeon. Transparent PNG background. No lettering, no grid, no text, no characters. Eight separated assets arranged in 4 columns by 2 rows with generous transparent gutters. Row1 cell1 a PERFECTLY SQUARE flat dark desaturated blue slate floor panel with subtle large 4x4 stone slabs, very low contrast and NOT perspective; cell2 another square floor panel in slightly teal grey with a tiny subdued gold inlay at its center; cell3 perfectly square flat top-down navy masonry wall block with a lighter top edge and thin golden ornament, no isometric angle; cell4 a squat square column with a pale stone cap, deep blue sides and small teal glowing shell rune. Row2 cell1 a closed ivory and dark teal treasure chest with gold corners and shell clasp; cell2 that same chest open, gold glow inside; cell3 a chunky turquoise crystal growing from a small dark rock base; cell4 a small warm amber lantern on a dark iron pedestal. Art uses midnight-blue shadows, teal highlights, desaturated limestone and rare muted gold details. All sprites clearly separate; ground floor blocks entirely opaque square with no transparent holes or corners. Perspective only for chest and decorative props (top down three-quarter view); floor and walls orthographic. Deliberate economical pixel clusters, dark outlines, no smooth gradients or glossy 3D render. Assets consistent with cute blue fish-maid hero and colorful frog enemies but keep floor low contrast for bullet readability. 1024x512 desired, 4 columns 2 rows.

### 主菜单

Create a polished original game title-screen background, landscape 16:9 pixel-art illustration. Use the attached blue-haired fish-maid character sprite sheet as the identity reference for the protagonist Da Fei Yu. Original nautical dungeon adventure, warm invitation and sense of mystery. Place the blue-haired fish girl on the RIGHT THIRD of the composition in three-quarter view: white maid cap, navy and white frilled dress, one hand lifting skirt, the other holding a little ivory and teal pistol with a peach-colored hand. Cute determined face, blue finlike hair flowing behind. She stands on a weathered stone bridge over dark turquoise water leading into a sunken temple doorway. Small green frog enemies peek from coral ruins in far background. A floating teal crystal lights her face; amber lanterns, cream stone arches, subtle gold shell motifs. LEFT HALF intentionally quiet and very dark navy with only soft distant silhouette, suitable for a readable menu overlay. Keep all text and titles absent. Strong art direction, deliberate clean pixel clusters, limited palette, beautifully layered environment, no interface, no labels, no grids, no watermark. This is a game key art composition, not a sprite sheet. All characters and architecture original, do not imitate any existing franchise. Opaque full bleed PNG.
