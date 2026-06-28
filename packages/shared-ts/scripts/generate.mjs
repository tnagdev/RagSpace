/**
 * Codegen script: compiles JSON Schema files in contracts/ into TypeScript types.
 * Run via: npm run generate  (automatically called by npm run build)
 *
 * Tools:
 *  - Object/event schemas → json-schema-to-typescript (generates interfaces)
 *  - Enum schemas → custom generator (produces TypeScript enum declarations)
 *
 * Output: src/generated/**  — DO NOT EDIT these files by hand.
 */
import { compile } from 'json-schema-to-typescript';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..', '..');
const contracts = resolve(root, 'contracts');
const outDir = resolve(__dirname, '..', 'src', 'generated');

const BANNER = `/* eslint-disable */\n// ============================================================\n// DO NOT EDIT — generated from contracts/ by scripts/generate.mjs\n// Run \`npm run generate\` in packages/shared-ts to regenerate.\n// ============================================================\n\n`;

const compileOpts = {
  bannerComment: '',
  additionalProperties: false,
  enableConstEnums: false,
};

/** Convert an enum value string to a valid TS identifier.
 *  Dotted namespaced values (e.g. file.upload.started) strip the first segment
 *  when 3+ parts are present, then join with _ and uppercase.
 *  Simple values (MP4, ACTIVE) pass through unchanged after uppercasing.
 */
function toEnumKey(v) {
  const parts = v.split('.');
  if (parts.length === 1) return v.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
  const relevant = parts.length > 2 ? parts.slice(1) : parts;
  return relevant.join('_').toUpperCase();
}

/** Generate a TypeScript enum from a JSON Schema enum file. */
function generateEnum(schemaPath, outputPath) {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const name = schema.title;
  const values = schema.enum;
  if (!name || !values) throw new Error(`${schemaPath} must have title and enum fields`);

  const body = values.map(v => `  ${toEnumKey(v)} = '${v}',`).join('\n');
  const ts = `export enum ${name} {\n${body}\n}\n`;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, BANNER + ts);
  console.log(`  ✓ (enum) ${schemaPath.replace(root, '')} → ${outputPath.replace(root, '')}`);
}

/** Generate a TypeScript interface from a JSON Schema object file. */
async function generateInterface(schemaPath, outputPath) {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const ts = await compile(schema, schema.title ?? 'Schema', { ...compileOpts, cwd: dirname(schemaPath) });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, BANNER + ts);
  console.log(`  ✓ (iface) ${schemaPath.replace(root, '')} → ${outputPath.replace(root, '')}`);
}

async function main() {
  console.log('Generating TypeScript from JSON Schema contracts...');

  // Enum schemas — produce enum declarations
  const enumEntries = [
    ['FileType', 'enums/FileType'],
    ['EventType', 'enums/EventType'],
    ['ProcessingStatus', 'enums/ProcessingStatus'],
    ['ProcessingStage', 'enums/ProcessingStage'],
    ['ServiceStatus', 'enums/ServiceStatus'],
    ['UsageMetricType', 'enums/UsageMetricType'],
  ];
  for (const [name, out] of enumEntries) {
    generateEnum(`${contracts}/enums/${name}.json`, `${outDir}/${out}.ts`);
  }

  // Object schemas — produce interfaces
  const ifaceEntries = [
    [`${contracts}/schemas/AuthUser.json`,            `${outDir}/AuthUser.ts`],
    [`${contracts}/schemas/AuthSession.json`,         `${outDir}/AuthSession.ts`],
    [`${contracts}/schemas/UploadedFile.json`,        `${outDir}/UploadedFile.ts`],
    [`${contracts}/schemas/Scene.json`,               `${outDir}/Scene.ts`],
    [`${contracts}/schemas/UsageCheckResult.json`,    `${outDir}/UsageCheckResult.ts`],
    [`${contracts}/schemas/PlanValidationResult.json`,`${outDir}/PlanValidationResult.ts`],
    [`${contracts}/events/UploadCompletedEvent.json`,    `${outDir}/events/UploadCompletedEvent.ts`],
    [`${contracts}/events/ProcessingCompletedEvent.json`,`${outDir}/events/ProcessingCompletedEvent.ts`],
    [`${contracts}/events/FileDeletedEvent.json`,       `${outDir}/events/FileDeletedEvent.ts`],
    [`${contracts}/events/UpdateFileStatusParams.json`, `${outDir}/events/UpdateFileStatusParams.ts`],
  ];
  await Promise.all(ifaceEntries.map(([src, dst]) => generateInterface(src, dst)));

  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
