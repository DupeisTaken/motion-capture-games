import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';

const schemaUrl = new URL('./schemas/observation.schema.json', import.meta.url);
const outputUrl = new URL('./generated/observation.ts', import.meta.url);
const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
const output = await compile(schema, 'Observation', {
  bannerComment: '/* Generated from contracts/schemas/observation.schema.json. Do not edit. */',
  unreachableDefinitions: true,
  // Runtime validation enforces array bounds; tuple unions obscure normal indexed access.
  ignoreMinAndMaxItems: true,
  style: { singleQuote: true, semi: true, trailingComma: 'all' },
});
if (process.argv.includes('--check')) {
  if ((await readFile(outputUrl, 'utf8')) !== output) {
    throw new Error('Observation bindings drifted. Run pnpm contracts:generate.');
  }
  console.log('Observation bindings match the canonical schema.');
} else {
  await writeFile(outputUrl, output);
  console.log(`Generated ${fileURLToPath(outputUrl)}`);
}
