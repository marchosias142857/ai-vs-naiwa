import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'art-src/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // 所有随机都必须走 src/sim/core/Random.ts，保证同一种子可复现。
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: '请使用 src/sim/core/Random.ts（带种子的随机）。' },
      ],
    },
  },
  {
    // zod 只在测试与校验脚本中运行；游戏代码只能 import type，避免 zod 进入生产包（ADR 0002）。
    files: ['src/**/*.ts'],
    ignores: ['src/data/schema/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              allowTypeImports: true,
              message: '运行时代码不能使用 zod；数据类型请 import type 自 src/data/schema（见 ADR 0002）。',
            },
          ],
        },
      ],
    },
  },
  {
    // 分层规则：sim/ 与 data/ 是纯逻辑，禁止依赖 Phaser 与表现层。
    files: ['src/sim/**/*.ts', 'src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['phaser', 'phaser/*'],
              message: 'sim/ 与 data/ 禁止 import Phaser（见 AGENTS.md「分层规则」）。',
            },
            {
              group: ['**/game/**', '**/services/**', '**/debug/**'],
              message: 'sim/ 与 data/ 不能依赖 game/、services/、debug/。',
            },
          ],
        },
      ],
    },
  },
);
