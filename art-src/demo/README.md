# Demo 美术来源与制作记录

## 来源与使用范围

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

