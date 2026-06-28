import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  detectLanguageAt,
  resolveMigrationLanguage,
  resolveMigrationLayout,
  compileMigrationPattern,
  MIGRATION_DEFAULTS,
} from "../../scripts/lakebase/migration-layout";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
  }
});
function mk(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "kit-miglayout-"));
  tmpDirs.push(d);
  return d;
}

describe("migration-layout", () => {
  describe("detectLanguageAt", () => {
    it("nodejs from package.json", () => {
      const d = mk();
      fs.writeFileSync(path.join(d, "package.json"), "{}");
      expect(detectLanguageAt(d)).toBe("nodejs");
    });
    it("python from alembic.ini", () => {
      const d = mk();
      fs.writeFileSync(path.join(d, "alembic.ini"), "");
      expect(detectLanguageAt(d)).toBe("python");
    });
    it("kotlin from src/main/kotlin under a pom", () => {
      const d = mk();
      fs.mkdirSync(path.join(d, "src", "main", "kotlin"), { recursive: true });
      fs.writeFileSync(path.join(d, "pom.xml"), "<project/>");
      expect(detectLanguageAt(d)).toBe("kotlin");
    });
    it("java from a plain pom", () => {
      const d = mk();
      fs.writeFileSync(path.join(d, "pom.xml"), "<project/>");
      expect(detectLanguageAt(d)).toBe("java");
    });
    it("unknown when no marker", () => {
      expect(detectLanguageAt(mk())).toBe("unknown");
    });
  });

  describe("resolveMigrationLanguage (monorepo-aware)", () => {
    it("descends from the configured migrationPath when root is unmarked", () => {
      const d = mk();
      fs.mkdirSync(path.join(d, "recipe-app", "migrations"), { recursive: true });
      fs.writeFileSync(path.join(d, "recipe-app", "package.json"), "{}");
      expect(detectLanguageAt(d)).toBe("unknown");
      expect(resolveMigrationLanguage(d, "recipe-app/migrations")).toBe("nodejs");
    });
    it("explicit override wins", () => {
      const d = mk();
      fs.writeFileSync(path.join(d, "package.json"), "{}");
      expect(resolveMigrationLanguage(d, "", "python")).toBe("python");
    });
    it("root detection wins over descent", () => {
      const d = mk();
      fs.mkdirSync(path.join(d, "recipe-app"), { recursive: true });
      fs.writeFileSync(path.join(d, "pyproject.toml"), "");
      fs.writeFileSync(path.join(d, "recipe-app", "package.json"), "{}");
      expect(resolveMigrationLanguage(d, "recipe-app/migrations")).toBe("python");
    });
    it("ignores an invalid override and falls back to detection", () => {
      const d = mk();
      fs.writeFileSync(path.join(d, "package.json"), "{}");
      expect(resolveMigrationLanguage(d, "", "cobol")).toBe("nodejs");
    });
    it("unknown when nothing matches", () => {
      const d = mk();
      fs.mkdirSync(path.join(d, "sub", "migrations"), { recursive: true });
      expect(resolveMigrationLanguage(d, "sub/migrations")).toBe("unknown");
    });
  });

  describe("compileMigrationPattern", () => {
    it("compiles a valid regex case-insensitively", () => {
      const re = compileMigrationPattern("^\\d+_.*\\.js$");
      expect(re).toBeInstanceOf(RegExp);
      expect(re!.test("001_INIT.JS")).toBe(true);
    });
    it("returns undefined for empty or invalid input", () => {
      expect(compileMigrationPattern("")).toBeUndefined();
      expect(compileMigrationPattern("([unclosed")).toBeUndefined();
    });
  });

  describe("resolveMigrationLayout", () => {
    it("monorepo nodejs: knex timestamped .js matches, flyway .sql does not", () => {
      const d = mk();
      fs.mkdirSync(path.join(d, "recipe-app", "migrations"), { recursive: true });
      fs.writeFileSync(path.join(d, "recipe-app", "package.json"), "{}");
      const layout = resolveMigrationLayout({ projectDir: d, migrationPath: "recipe-app/migrations" });
      expect(layout.language).toBe("nodejs");
      expect(layout.migrationPath).toBe("recipe-app/migrations");
      expect(layout.migrationGlob).toBe("*.{js,ts}");
      expect(layout.migrationPattern.test("20260101120000_create_recipes.js")).toBe(true);
      expect(layout.migrationPattern.test("V1__init.sql")).toBe(false);
    });
    it("explicit overrides win and missing ones fall back to language defaults", () => {
      const d = mk();
      fs.writeFileSync(path.join(d, "package.json"), "{}"); // would detect nodejs
      const layout = resolveMigrationLayout({
        projectDir: d,
        language: "python",
        migrationPattern: "^\\d+_.*\\.js$",
      });
      expect(layout.language).toBe("python");
      expect(layout.migrationPath).toBe(MIGRATION_DEFAULTS.python.path); // not configured -> default
      expect(layout.migrationGlob).toBe(MIGRATION_DEFAULTS.python.glob);
      expect(layout.migrationPattern.test("001_init.js")).toBe(true);
    });
    it("unknown language falls back to the flyway defaults", () => {
      const d = mk();
      const layout = resolveMigrationLayout({ projectDir: d });
      expect(layout.language).toBe("unknown");
      expect(layout.migrationPath).toBe("src/main/resources/db/migration");
      expect(layout.migrationGlob).toBe("*.sql");
    });
  });
});
