#!/usr/bin/env node
// Converts the paper's vector figure PDFs (src/contents/full_paper/figures/**/*.pdf) into
// SVGs co-located next to their source PDF (same name, .svg extension), via poppler's
// `pdftocairo -svg`. The PDFs are the source of truth (matching the paper's LaTeX figures
// 1:1); the SVGs are a committed build artifact so the site can render them without
// requiring poppler at CI build time — mirrors how `sync:paper-data` commits its distilled
// JSON. Re-run this (`npm run convert:figures`) whenever a figure PDF is added or changed,
// and commit both the PDF and the regenerated SVG.
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const FIGURES_DIR = path.resolve(process.cwd(), 'src/contents/full_paper/figures');

function findPdfs(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...findPdfs(full));
    } else if (entry.endsWith('.pdf')) {
      out.push(full);
    }
  }
  return out;
}

const pdfs = findPdfs(FIGURES_DIR);
if (pdfs.length === 0) {
  console.log('No figure PDFs found under', FIGURES_DIR);
  process.exit(0);
}

for (const pdf of pdfs) {
  const svg = pdf.replace(/\.pdf$/, '.svg');
  execFileSync('pdftocairo', ['-svg', pdf, svg]);
  console.log('converted', path.relative(process.cwd(), pdf), '->', path.relative(process.cwd(), svg));
}
