// Shared loader + compiler for the TDD JSON schemas under
// scripts/tdd/schemas/. Single source of schema-compilation truth so
// spec-sync (drift reporting) and artifact-conformance (gate
// preconditions) validate against the SAME compiled validators instead of
// each rolling their own Ajv instance.
//
// Validators are compiled lazily and cached by schema filename: the first
// caller pays the compile, every later caller reuses it.

import { readFileSync } from "fs";
import { join } from "path";
import Ajv, { type ValidateFunction } from "ajv";

const SCHEMA_DIR = join(__dirname, "schemas");

const ajv = new Ajv({ allErrors: true, strict: false });
const validatorCache = new Map<string, ValidateFunction>();

/** Read + parse a schema file from scripts/tdd/schemas/ by filename. */
export function loadSchema(name: string): object {
  return JSON.parse(readFileSync(join(SCHEMA_DIR, name), "utf8"));
}

/**
 * Return a cached, compiled Ajv validator for a schema filename
 * (e.g. "feature.schema.json"). Compiles on first use, then memoizes.
 */
export function getValidator(name: string): ValidateFunction {
  const cached = validatorCache.get(name);
  if (cached) return cached;
  const validate = ajv.compile(loadSchema(name));
  validatorCache.set(name, validate);
  return validate;
}

/**
 * Render Ajv validation errors into short, human-readable strings like
 * `/status: must be equal to one of the allowed values`. Falls back to a
 * generic message when Ajv attached no error detail.
 */
export function formatSchemaErrors(validate: ValidateFunction): string[] {
  const errors = validate.errors ?? [];
  if (errors.length === 0) return ["schema validation failed"];
  return errors.map((e) => {
    const where = e.instancePath && e.instancePath.length > 0 ? e.instancePath : "(root)";
    return `${where}: ${e.message ?? "invalid"}`;
  });
}
