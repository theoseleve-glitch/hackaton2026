// Dev/prod R2 seed helper for the content seam. The worker loads content packs
// from the `bloop-content` R2 bucket at runtime (keyed by pack.id) instead of
// bundling them — so R2 MUST be seeded ONCE per environment before the server
// can start any game. This script is NOT part of the gate; it is the manual
// one-time (and on-content-change) seeding tool.
//
// Run from the bloop root (Node 20+; uses native TS type-stripping to read the
// generated pack modules — each pack file is type-only-import, so importing the
// .ts directly needs no transpile step):
//
//   node scripts/seed-r2.mjs            # write content/r2/<id>.json + print the wrangler put commands
//   node scripts/seed-r2.mjs --remote   # also run `wrangler r2 object put ... --remote` for each pack
//
// The printed/run commands target the SAME bucket name as wrangler.jsonc
// (bloop-content). Re-seeding is safe: R2 keys are immutable per id, and the
// worker caches by id, so overwriting an existing key with identical bytes is a
// no-op for determinism.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'apps', 'server', 'src', 'content');
const outDir = join(root, 'content', 'r2');
const BUCKET = 'bloop-content'; // must match wrangler.jsonc r2_buckets[].bucket_name
const remote = process.argv.includes('--remote');

// The individual generated pack modules and the export names this script reads.
// (We import the per-game .ts files directly rather than content/index.ts, which
// has runtime .js imports that bare type-stripping does not resolve.)
const MODULES = {
  'tracer-pack.ts': ['TRACER_PACK'],
  'pires-potes-pack.ts': ['PIRES_POTES_PACK'],
  'option-vote-packs.ts': ['TU_PREFERES_PACK', 'GAUCHE_DROITE_PACK'],
  'input-guess-packs.ts': ['QUIZZ_CULTURE_GE_PACK', 'CINQUANTE_CINQUANTE_PACK'],
  'secret-role-pack.ts': ['DOUBLE_JEU_PACK'],
  'truth-dare-packs.ts': ['TRUTH_OR_DARE_2_PACK', 'TRUTH_OR_DRINK_PACK'],
  'spotlight-guess-packs.ts': ['JEU_DE_LA_NOTE_PACK', 'DEVINE_LA_QUESTION_PACK'],
  'last-standing-pack.ts': ['JEU_DU_THEME_PACK'],
  'rule-hunt-packs.ts': ['TROUVEZ_LA_REGLE_PACK'],
  'night-day-pack.ts': ['LOUP_GAROU_PACK'],
  'perform-judge-packs.ts': [
    'DEVINE_L_ACTION_PACK', 'DEVINE_L_OBJET_PACK', 'MIME_INVERSE_PACK', 'DOUBLE_LE_MOUVEMENT_PACK',
  ],
};

async function collectPacks() {
  const packs = [];
  for (const [file, names] of Object.entries(MODULES)) {
    const mod = await import(pathToFileURL(join(contentDir, file)).href);
    for (const name of names) {
      const pack = mod[name];
      if (pack === undefined) throw new Error(`${file} does not export ${name}`);
      packs.push(pack);
    }
  }
  return packs;
}

const packs = await collectPacks();
mkdirSync(outDir, { recursive: true });

for (const pack of packs) {
  const file = join(outDir, `${pack.id}.json`);
  writeFileSync(file, JSON.stringify(pack));
  const cmd = `wrangler r2 object put ${BUCKET}/${pack.id} --file "${file}"${remote ? ' --remote' : ''}`;
  if (remote) {
    console.log(`seeding ${pack.id} -> ${BUCKET} (remote)`);
    execFileSync('wrangler', ['r2', 'object', 'put', `${BUCKET}/${pack.id}`, '--file', file, '--remote'], {
      cwd: join(root, 'apps', 'server'), stdio: 'inherit',
    });
  } else {
    console.log(cmd);
  }
}

console.log(`\n${packs.length} packs written to ${outDir}.`);
if (!remote) console.log('Run the commands above (or re-run with --remote) to seed the R2 bucket once.');
