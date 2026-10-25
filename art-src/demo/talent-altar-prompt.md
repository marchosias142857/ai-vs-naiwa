# 潮汐祭台

- 制作日期：2026-10-25，任务 #98。
- 工具：内置 imagegen，透明背景；未使用 CLI 或第三方下载素材。
- 项目文件：`public/assets/demo/talent-altar-v1.png`。
- 原始输出：1254 × 1254 RGBA PNG，1,215,083 字节；原始 Git blob 为 `4f4a9cf2eeff6dfc1c20379754912124783df900`，保留在提交历史中，不重复打包。
- 运行时输出：按负责人确认缩到 528 × 528，276,649 字节。最近邻缩放保留像素边缘；alpha 240–254 归一为 255，低于 240 的透明边缘保留，RGB 不另行调色。RGBA 解码数据约 1.12 MB（不含驱动开销），原图约 6.29 MB。
- 原创海洋祭台：双层蓝灰石台、青色珍珠与鳞甲／鱼叉／洋流三个石刻意象。按负责人请求用于本项目，不另行声明工具未提供的第三方许可。
- 负责人于 2026-10-25 明确接受本项目使用该 imagegen 生成素材；缩图仅为现有素材的确定性处理，没有重新生成或改变构图。
- 世界显示尺寸 62 × 62，NEAREST 采样；祭台静态显示，不创建逐帧发光特效或额外更新循环。随 Workbox 预缓存，文件小于单文件 2 MiB 上限。
- 图片通过 GitHub 网页文件选择器上传实际文件；上传后核对 Git blob SHA 与字节数。验证记录见 `docs/testing/talents.md`。

缩图命令（ImageMagick；输入为上述原始文件）：

```sh
convert original.png -filter point -resize 528x528 -channel A -fx 'u >= 240/255 ? 1 : u' +channel -strip PNG32:talent-altar-v1.png
```

## 最终生成提示

Use case: stylized-concept. Asset type: one standalone transparent PNG sprite for an existing high-resolution pixel-art top-down roguelike game hub. Draw a single compact magical sea altar, readable at a small game size, in a 3/4 top-down view with the front visible, centered with a modest transparent margin. Low circular dark blue-grey stone plinth with two stepped tiers; a small luminous turquoise pearl suspended over a shallow basin; three subtle stone motifs suggesting a fish scale, a trident, and a water current. Carefully placed crisp square pixels, strong clean silhouette, restrained palette, fine deliberate pixel shading consistent with a polished pixel dungeon game. Approximate underlying sprite detail 96 by 96 pixels, enlarged cleanly with square pixel edges; no blurry gradients, no painterly surfaces, no text, no letters, no numbers, no characters, no room, no background tiles, no separate icon grid. True transparent background; complete altar fully in frame. The artwork must be a usable standalone game prop with transparency, not a mockup.
