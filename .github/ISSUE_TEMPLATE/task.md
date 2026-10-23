---
name: 开发任务
about: 分配给 Claude 或 ChatGPT 的一项开发任务
title: '[M?] '
labels: ''
---

## 目标

一句话：完成后玩家 / 开发者能做什么。

## 范围

- 要改的目录 / 文件：
- 不要碰的：

## 验收标准

- [ ] 可验证的条件 1（如：`?scene=Game` 进入后门会锁，清怪后开门）
- [ ] `npm run check` 全绿
- [ ] `sim/` 下的新逻辑有单测

## 依赖

- 前置 Issue：#
- 涉及共享契约（`sim/core/types.ts`、`events.ts`、`data/schema/`、`config.ts`）：是 / 否（是则需要 ADR）

## 负责

`owner:claude` / `owner:gpt` · 里程碑：M?
