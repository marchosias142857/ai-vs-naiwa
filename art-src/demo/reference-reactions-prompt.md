# 参考图 2 受击与死亡制作提示

2026-10-24，内置 imagegen 编辑模式；参考为负责人上传的 `大肥鱼动作帧(3).png`，后补的 `(4)` 与其 SHA-256 完全相同。原待机和行走逐字节保留，只采用下列独立反应图集。

## 首次制作

Use case: identity-preserve. Asset type: pixel art game sprite animation atlas.
Input image 1 is the exact authoritative character reference and edit target: Da Fei Yu, a tiny squat blue-haired fish maid with large square head, blue spiral hair curl, white maid headband, blue side fin ears, blue fish tail pointing to the right, simple cyan eyes, dark navy dress, small white apron, short black legs. Preserve this exact identity, proportions, coarse pixel size, dark outline, palette, face and clothing. It is NOT a detailed anime maid. Do not redesign.
Create a NEW complementary reaction atlas containing exactly SIX separated animation cels matching that supplied sprite. Do not reproduce the idle or walk frames. Transparent background, crisp square pixel edges and simple flat pixel shading. No lettering, labels, grid lines, shadows, weapons or effects outside character.
Layout 3 columns by 2 rows on 1536x1024 canvas, equal 512x512 cells, with ample transparent padding. All sprites maintain same head size and drawing scale, about 275px tall when upright. Baseline at 400px within each cell, no neighboring overlap.
Read order:
Top left hurt_0: same upright fish maid recoils slightly, eyes squeezed shut, torso leans back a little, tail snaps upward.
Top middle hurt_1: recovering toward original stance, eyes still wincing, tail settles. Two frames should form a quick hit reaction.
Top right death_0: weakened, eyes closed, head droops, knees bend.
Bottom left death_1: sinks to knees, head lowered, tail bends down.
Bottom middle death_2: tips over toward the left, same body now diagonal on the floor.
Bottom right death_3: lies fully on her left side, closed eyes, recognizable blue hair curl and tail, restful non-graphic defeated pose. Entire body intact and visible.
Keep the original character's coarse minimal pixel-art style absolutely. Six frames only. Actual transparent alpha.

## 去手与透明背景修订

Use case: background-extraction and precise-object-edit. Edit image 1, the six-frame reaction atlas. Image 2 is the original authoritative character reference.
Change ONLY these two issues:
1. Remove ALL diffuse smoky blue/grey glows and shadows surrounding every sprite. Empty space must have alpha EXACTLY 0, including gaps around hair curl and between the legs. Sprite interiors must be opaque, alpha255, with clean hard pixel silhouette boundaries. No hazy semi-transparent pixels, no checkerboard or solid background. Keep the black pixel outline opaque.
2. Match original reference image 2's NO HANDS rule: on reaction atlas frames, replace any exposed peach hands below the face with dark navy sleeve/dress pixels. The only exposed skin is the face. Feet remain dark shoes. Do not add arms.
Absolutely preserve all six poses, face expressions, character artwork, colors, pixel size, locations, dimensions and 3x2 arrangement from image 1. Do not scale, shift, crop or redesign anything. Output the same 1536x1024 atlas with true clean transparent alpha.
