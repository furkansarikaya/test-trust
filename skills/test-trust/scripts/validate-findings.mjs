#!/usr/bin/env node
// Validates a test-trust findings.json against ../schema/findings.schema.json,
// then checks that every evidence file it cites exists. No dependencies.
// Usage: node <skill-dir>/scripts/validate-findings.mjs <path-to-findings.json>
// Exit codes: 0 valid, 1 invalid, 2 usage or read error.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "schema", "findings.schema.json");

// ponytail: implements only the JSON Schema keywords findings.schema.json uses;
// add a keyword here before using it in the schema.
export function validate(schema, data, root = schema, path = "$") {
  if (schema === true) return [];
  if (schema === false) return [`${path}: not allowed`];
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, "").split("/").reduce((o, k) => o[k], root);
    return validate(target, data, root, path);
  }
  const errors = [];
  const add = (msg) => errors.push(`${path}: ${msg}`);

  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some((t) => typeOf(data, t))) return [`${path}: expected ${types.join(" or ")}`];
  }
  if (schema.enum && !schema.enum.includes(data)) add(`must be one of ${schema.enum.join(", ")}`);
  if ("const" in schema && data !== schema.const) add(`must be ${schema.const}`);
  if (typeof data === "string") {
    if (schema.minLength !== undefined && data.length < schema.minLength) add(`shorter than ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) add(`does not match ${schema.pattern}`);
  }
  if (typeof data === "number") {
    if (schema.minimum !== undefined && data < schema.minimum) add(`less than ${schema.minimum}`);
    if (schema.maximum !== undefined && data > schema.maximum) add(`greater than ${schema.maximum}`);
  }
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) add(`needs at least ${schema.minItems} item(s)`);
    if (schema.items) data.forEach((v, i) => errors.push(...validate(schema.items, v, root, `${path}[${i}]`)));
  }
  if (typeOf(data, "object")) {
    for (const k of schema.required ?? []) if (!(k in data)) add(`missing required "${k}"`);
    for (const [k, sub] of Object.entries(schema.properties ?? {})) {
      if (k in data) errors.push(...validate(sub, data[k], root, `${path}.${k}`));
    }
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(data)) if (!(k in (schema.properties ?? {}))) add(`unexpected "${k}"`);
    }
  }
  for (const sub of schema.allOf ?? []) errors.push(...validate(sub, data, root, path));
  if (schema.anyOf && !schema.anyOf.some((sub) => validate(sub, data, root, path).length === 0)) {
    add("matches none of the allowed alternatives");
  }
  if (schema.if) {
    const branch = validate(schema.if, data, root, path).length === 0 ? schema.then : schema.else;
    if (branch !== undefined) errors.push(...validate(branch, data, root, path));
  }
  return errors;
}

function typeOf(v, t) {
  if (t === "object") return v !== null && typeof v === "object" && !Array.isArray(v);
  if (t === "array") return Array.isArray(v);
  if (t === "integer") return Number.isInteger(v);
  if (t === "null") return v === null;
  return typeof v === t;
}

// Evidence paths are relative to the folder holding findings.json.
export function missingEvidence(doc, baseDir) {
  const errors = [];
  for (const f of doc.findings ?? []) {
    const paths = [
      ...(f.evidence ?? []).map((e) => e.path),
      ...(f.observed?.surviving_mutants ?? []).map((m) => m.diff_path),
    ];
    for (const p of paths) {
      if (typeof p !== "string") continue;
      const r = relative(baseDir, resolve(baseDir, p));
      if (isAbsolute(p) || r.startsWith("..") || isAbsolute(r)) {
        errors.push(`${f.id}: evidence path escapes the output folder: ${p}`);
        continue;
      }
      if (!existsSync(join(baseDir, p))) errors.push(`${f.id}: evidence file not found: ${p}`);
    }
  }
  return errors;
}

function main(argv) {
  if (argv.length !== 1) {
    console.error("Usage: node validate-findings.mjs <path-to-findings.json>");
    return 2;
  }
  const file = resolve(argv[0]);
  let doc, schema;
  try {
    schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
    doc = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`Cannot read input: ${e.message}`);
    return 2;
  }
  const errors = validate(schema, doc);
  if (errors.length === 0) errors.push(...missingEvidence(doc, dirname(file)));
  if (errors.length) {
    console.error(`INVALID: ${file}`);
    for (const e of errors) console.error(`  ${e}`);
    return 1;
  }
  console.log(`VALID: ${file} (${doc.findings.length} finding(s))`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
