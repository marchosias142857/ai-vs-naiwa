import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * 分层边界的回归检查（ADR 0002）。和 ESLint 规则互为补充：这里把相对路径解析成真实文件位置再判断，
 * 不受 `./schema`、`../../data/schema/index` 这类写法差异影响。
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const SRC = join(ROOT, 'src');
const SCHEMA_DIR = join(SRC, 'data', 'schema');

interface ImportRef {
  specifier: string;
  typeOnly: boolean;
}

/** 列出一个文件里的全部模块引用：import、export … from、动态 import()、import x = require()。 */
export function listImports(code: string, fileName = 'probe.ts'): ImportRef[] {
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const refs: ImportRef[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const allNamedTypeOnly =
        !!named &&
        ts.isNamedImports(named) &&
        named.elements.length > 0 &&
        named.elements.every((e) => e.isTypeOnly) &&
        !clause?.name;
      // `import 'x'` 没有 clause：有副作用，按值导入处理。
      refs.push({ specifier: node.moduleSpecifier.text, typeOnly: !!clause?.isTypeOnly || allNamedTypeOnly });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const named = node.exportClause;
      const allNamedTypeOnly =
        !!named &&
        ts.isNamedExports(named) &&
        named.elements.length > 0 &&
        named.elements.every((e) => e.isTypeOnly);
      refs.push({ specifier: node.moduleSpecifier.text, typeOnly: node.isTypeOnly || allNamedTypeOnly });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      refs.push({ specifier: node.arguments[0].text, typeOnly: false });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      refs.push({ specifier: node.moduleReference.expression.text, typeOnly: node.isTypeOnly });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return refs;
}

const isZod = (specifier: string) => specifier === 'zod' || specifier.startsWith('zod/');
const isPhaser = (specifier: string) => specifier === 'phaser' || specifier.startsWith('phaser/');
const resolveRelative = (fromFile: string, specifier: string) =>
  specifier.startsWith('.') ? resolve(dirname(fromFile), specifier) : null;
const isInside = (path: string, dir: string) => path === dir || path.startsWith(dir + sep);
const inSrc = (path: string, ...parts: string[]) => isInside(path, join(SRC, ...parts));

/** 检查一个 src 文件的全部引用，返回违规说明（空数组表示合规）。 */
export function checkFile(filePath: string, code: string): string[] {
  const problems: string[] = [];
  const inSchema = isInside(filePath, SCHEMA_DIR);
  const pureLayer = inSrc(filePath, 'sim') || inSrc(filePath, 'data');
  for (const { specifier, typeOnly } of listImports(code, filePath)) {
    const target = resolveRelative(filePath, specifier);
    if (!inSchema && !typeOnly && isZod(specifier)) problems.push(`运行时导入 ${specifier}`);
    if (!inSchema && !typeOnly && target && isInside(target, SCHEMA_DIR)) {
      problems.push(`运行时导入数据 schema（${specifier}），只能 import type`);
    }
    if (pureLayer && isPhaser(specifier)) problems.push(`sim/ 与 data/ 不能依赖 ${specifier}`);
    if (pureLayer && target && ['game', 'services', 'debug', 'pwa'].some((d) => inSrc(target, d))) {
      problems.push(`sim/ 与 data/ 不能依赖表现层（${specifier}）`);
    }
  }
  return problems;
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.(ts|js)$/.test(entry.name) ? [full] : [];
  });
}

describe('分层边界', () => {
  const at = (...parts: string[]) => join(SRC, ...parts);

  it('src 下所有文件都合规', () => {
    const violations = listSourceFiles(SRC).flatMap((file) =>
      checkFile(file, readFileSync(file, 'utf-8')).map((p) => `${relative(ROOT, file)}: ${p}`),
    );
    expect(violations).toEqual([]);
  });

  describe('检查器本身（回归用例）', () => {
    const game = at('game', 'probe.ts');
    const sim = at('sim', 'probe.ts');
    const data = at('data', 'weapons.ts');
    const schema = at('data', 'schema', 'weapon.ts');

    it.each([
      ["import { z } from 'zod';", game],
      ["import { z } from 'zod/v4';", game],
      ["import * as z from 'zod/mini';", sim],
      ["export { z } from 'zod';", game],
      ["const m = import('zod');", game],
      ["import { WeaponDefSchema } from '../data/schema';", game],
      ["import { WeaponDefSchema } from '../../data/schema/weapon';", at('sim', 'weapons', 'probe.ts')],
      ["import { WeaponDefSchema } from './schema';", data],
      ["import { type WeaponDef, WeaponDefSchema } from './schema';", data],
      ["import './schema';", data],
      ["import { Scene } from 'phaser';", sim],
      ["import { TEX } from '../game/assets/keys';", sim],
      ["import { unlockAudio } from '../services/unlockAudio';", at('data', 'probe.ts')],
    ])('拦截：%s', (code, file) => {
      expect(checkFile(file, code)).not.toEqual([]);
    });

    it.each([
      ["import type { WeaponDef } from './schema';", data],
      ["import { type WeaponDef } from './schema';", data],
      ["import type { z } from 'zod';", game],
      ["export type { WeaponDef } from '../data/schema';", game],
      ["import { z } from 'zod';", schema],
      ["import { IdSchema } from './common';", schema],
      ["import { Random } from '../sim/core/Random';", game],
      ["import { Scene } from 'phaser';", game],
    ])('允许：%s', (code, file) => {
      expect(checkFile(file, code)).toEqual([]);
    });
  });
});
