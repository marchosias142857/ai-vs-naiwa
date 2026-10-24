# 开屏对峙插画

- 制作日期：2026-10-24。
- 工具：内置 imagegen，非 CLI；未下载第三方素材。
- 角色来源：负责人提供的 `大肥鱼(2).jpeg` 与 `奶蛙三视图.jpg`，仅用作角色身份参考；参考文件的权利属于其原权利人，不另行声明其许可。
- 生成结果：原创对峙场景；本项目按负责人请求使用。
- 项目资源：`public/assets/demo/title-confrontation-v1.webp`。
- 输出原图：1254×1254 PNG。发布版仅作无损 WebP 编码，未裁切、缩放或更改像素；1,713,198 字节。
- 构图：左下大肥鱼持枪朝右上；右上奶蛙站在悬崖边，维持无表情。两人全身均保留。菜单只占图片左侧的独立暗色区域，不遮挡人物。

## 生成提示记录

Create a square pixel-art key illustration for the RIGHT half of a landscape mobile game's opening screen. Target 1024×1024. Use both attached images as character identity references, not editing targets.

Reference 1 is the blue long-haired whale-tail maid heroine: navy and white maid dress, white apron and headband. Place her in the lower-left in rear three-quarter view, holding a firearm and aiming up-right; show an identifiable face profile and full body including her tail.

Reference 2 is the golden-yellow pear-shaped upright creature with tiny eyes, cream oval belly, short arms and legs. Place it in the upper-right standing on top of a tall rocky cliff, looking down at the heroine. Preserve its blank, deadpan expression: no smile, no angry eyebrows. Show its full body.

Build a clearly readable diagonal confrontation across a deep navy/slate-blue dungeon chasm, muted cyan atmospheric depth and warm yellow focal color. Clean detailed pixel clusters and chunky deliberate pixel edges, no fuzzy painting or noise overlay. Keep the background quiet enough for small mobile display. No cropping of the characters, no text, UI, logos or additional characters. Opaque background.

## 发布

`preloadDemoArt` 加载独立版本文件名；NEAREST 采样。Workbox 预缓存 WebP，删除旧 title.png。格式与预算通过资源测试，实际离线加载通过浏览器测试；具体结果见 `docs/testing/town-entry.md`。
