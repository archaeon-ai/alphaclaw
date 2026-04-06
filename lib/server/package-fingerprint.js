const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const kIgnoredDirectoryNames = new Set([".git", "node_modules"]);

const normalizeRelativePath = (packageRoot, absolutePath) =>
  path.relative(packageRoot, absolutePath).split(path.sep).join("/");

const addIncludedPath = ({ includeSet, value }) => {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return;
  includeSet.add(normalizedValue.replace(/\/+$/, ""));
};

const collectIncludedPaths = ({ packageJson = {} } = {}) => {
  const includeSet = new Set(["package.json"]);

  if (Array.isArray(packageJson.files)) {
    for (const entry of packageJson.files) {
      addIncludedPath({ includeSet, value: entry });
    }
  }

  if (typeof packageJson.bin === "string") {
    addIncludedPath({ includeSet, value: packageJson.bin });
  } else if (packageJson.bin && typeof packageJson.bin === "object") {
    for (const entry of Object.values(packageJson.bin)) {
      addIncludedPath({ includeSet, value: entry });
    }
  }

  return Array.from(includeSet).sort((left, right) => left.localeCompare(right));
};

const walkIncludedFiles = ({
  fsModule = fs,
  packageRoot,
  absolutePath,
  files,
}) => {
  if (!fsModule.existsSync(absolutePath)) return;
  const relativePath = normalizeRelativePath(packageRoot, absolutePath);
  if (!relativePath || relativePath.startsWith("..")) return;

  const stat = fsModule.lstatSync(absolutePath);
  if (stat.isSymbolicLink()) {
    files.push({
      relativePath,
      hash: `symlink:${fsModule.readlinkSync(absolutePath)}`,
    });
    return;
  }
  if (stat.isFile()) {
    files.push({
      relativePath,
      hash: crypto
        .createHash("sha256")
        .update(fsModule.readFileSync(absolutePath))
        .digest("hex"),
    });
    return;
  }
  if (!stat.isDirectory()) return;

  const entries = fsModule
    .readdirSync(absolutePath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (entry.isDirectory() && kIgnoredDirectoryNames.has(entry.name)) continue;
    walkIncludedFiles({
      fsModule,
      packageRoot,
      absolutePath: path.join(absolutePath, entry.name),
      files,
    });
  }
};

const computePackageFingerprint = ({
  fsModule = fs,
  packageRoot,
  packageJsonPath = path.join(packageRoot, "package.json"),
} = {}) => {
  const resolvedPackageRoot = path.resolve(String(packageRoot || ""));
  if (!resolvedPackageRoot || !fsModule.existsSync(packageJsonPath)) return null;

  let packageJson;
  try {
    packageJson = JSON.parse(fsModule.readFileSync(packageJsonPath, "utf8"));
  } catch {
    return null;
  }

  const files = [];
  for (const includePath of collectIncludedPaths({ packageJson })) {
    walkIncludedFiles({
      fsModule,
      packageRoot: resolvedPackageRoot,
      absolutePath: path.resolve(resolvedPackageRoot, includePath),
      files,
    });
  }

  const hash = crypto.createHash("sha256");
  hash.update("package-fingerprint-v1");
  for (const entry of files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))) {
    hash.update(entry.relativePath);
    hash.update("\0");
    hash.update(entry.hash);
    hash.update("\0");
  }
  return hash.digest("hex");
};

const resolvePackageRootFromEntryPath = ({
  fsModule = fs,
  entryPath,
} = {}) => {
  let cursor = path.dirname(path.resolve(String(entryPath || "")));
  while (cursor && cursor !== path.dirname(cursor)) {
    if (fsModule.existsSync(path.join(cursor, "package.json"))) {
      return cursor;
    }
    cursor = path.dirname(cursor);
  }
  return null;
};

const packLocalPackageForInstall = ({
  execSyncImpl,
  fsModule = fs,
  packageRoot,
  tempDirPrefix = "alphaclaw-package-pack-",
} = {}) => {
  const resolvedPackageRoot = path.resolve(String(packageRoot || ""));
  const packDir = fsModule.mkdtempSync(path.join(os.tmpdir(), tempDirPrefix));
  try {
    const packStdout = String(
      execSyncImpl(
        `npm pack ${shellQuote(resolvedPackageRoot)} --quiet --ignore-scripts --pack-destination ${shellQuote(packDir)}`,
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "inherit"],
          timeout: 180000,
        },
      ) || "",
    )
      .trim()
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    const packFileName =
      packStdout.at(-1) ||
      fsModule.readdirSync(packDir).find((entry) => entry.endsWith(".tgz"));
    if (!packFileName) {
      throw new Error(`npm pack did not produce a tarball for ${resolvedPackageRoot}`);
    }
    const tarballPath = path.join(packDir, packFileName);
    if (!fsModule.existsSync(tarballPath)) {
      throw new Error(`Packed tarball missing at ${tarballPath}`);
    }
    return {
      tarballPath,
      cleanup: () => {
        try {
          fsModule.rmSync(packDir, { recursive: true, force: true });
        } catch {}
      },
    };
  } catch (error) {
    try {
      fsModule.rmSync(packDir, { recursive: true, force: true });
    } catch {}
    throw error;
  }
};

const shellQuote = (value) =>
  `'${String(value || "").replace(/'/g, `'\"'\"'`)}'`;

module.exports = {
  computePackageFingerprint,
  packLocalPackageForInstall,
  resolvePackageRootFromEntryPath,
};
