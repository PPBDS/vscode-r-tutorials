"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRScript = runRScript;
exports.isValidName = isValidName;
exports.shellQuote = shellQuote;
exports.buildRunCommand = buildRunCommand;
exports.buildInstallAndRunCommand = buildInstallAndRunCommand;
exports.buildRscriptCandidates = buildRscriptCandidates;
exports.getRegistryKeys = getRegistryKeys;
exports.resolveRscriptPath = resolveRscriptPath;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Run an R script via Rscript, using a temp file to avoid shell quoting issues.
 * Returns both stdout and stderr so callers can surface R-level diagnostics.
 */
async function runRScript(code, rscriptPath) {
    const tmpFile = path.join(os.tmpdir(), `r-tutorials-${Date.now()}.R`);
    fs.writeFileSync(tmpFile, code, 'utf8');
    try {
        const { stdout, stderr } = await execAsync(`"${rscriptPath}" "${tmpFile}"`);
        return { stdout, stderr };
    }
    finally {
        try {
            fs.unlinkSync(tmpFile);
        }
        catch { }
    }
}
// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
const SAFE_NAME_RE = /^[a-zA-Z0-9._\-]+$/;
function isValidName(name) {
    return SAFE_NAME_RE.test(name);
}
// ---------------------------------------------------------------------------
// Shell quoting
// ---------------------------------------------------------------------------
/**
 * Quote an Rscript path for use in terminal.sendText().
 * On Windows, paths with spaces or backslashes need quoting.
 * On Unix, a bare "Rscript" works fine but quoting is harmless.
 */
function shellQuote(p) {
    if (p.includes(' ') || p.includes('\\')) {
        return `"${p}"`;
    }
    return p;
}
// ---------------------------------------------------------------------------
// Terminal command building (pure functions — easy to test)
// ---------------------------------------------------------------------------
/**
 * Build the terminal command to run a tutorial.
 */
function buildRunCommand(rscriptPath, tutorialId, packageName) {
    const quoted = shellQuote(rscriptPath);
    return `${quoted} -e "learnr::run_tutorial('${tutorialId}', package = '${packageName}')"`;
}
/**
 * Build the terminal command to install missing packages then run a tutorial.
 */
function buildInstallAndRunCommand(rscriptPath, tutorialId, packageName, missingPackages) {
    const quoted = shellQuote(rscriptPath);
    const installCmd = missingPackages.map(p => `'${p}'`).join(', ');
    return `${quoted} -e "install.packages(c(${installCmd}), repos = 'https://cloud.r-project.org'); learnr::run_tutorial('${tutorialId}', package = '${packageName}')"`;
}
// ---------------------------------------------------------------------------
// R path discovery
// ---------------------------------------------------------------------------
/**
 * Given an R install directory, return candidate Rscript paths in preference
 * order. This is a pure function so it can be tested on any platform.
 */
function buildRscriptCandidates(installDir) {
    return [
        path.join(installDir, 'bin', 'x64', 'Rscript.exe'),
        path.join(installDir, 'bin', 'Rscript.exe')
    ];
}
/**
 * Return the Windows Registry keys to search for R's install path, in order.
 * Pure function — testable on any platform.
 */
function getRegistryKeys() {
    return [
        'HKLM\\SOFTWARE\\R-core\\R',
        'HKLM\\SOFTWARE\\WOW6432Node\\R-core\\R'
    ];
}
/**
 * Resolve the path to the Rscript executable using a layered strategy:
 *   1. User-configured setting (rTutorials.rscriptPath)
 *   2. Windows Registry (HKLM\SOFTWARE\R-core\R\InstallPath)
 *   3. Plain "Rscript" on PATH
 *
 * Returns the resolved path, or undefined if R cannot be found at all.
 */
async function resolveRscriptPath() {
    // 1. Check user setting
    const config = vscode.workspace.getConfiguration('rTutorials');
    const userPath = config.get('rscriptPath', '').trim();
    if (userPath.length > 0) {
        if (await isExecutable(userPath)) {
            return userPath;
        }
        vscode.window.showWarningMessage(`The configured Rscript path "${userPath}" is not valid. Trying auto-detection…`);
    }
    // 2. On Windows, try the registry
    if (process.platform === 'win32') {
        const registryPath = getRscriptFromWindowsRegistry();
        if (registryPath && await isExecutable(registryPath)) {
            return registryPath;
        }
    }
    // 3. Fall back to PATH
    if (await isExecutable('Rscript')) {
        return 'Rscript';
    }
    return undefined;
}
/**
 * Check if a command/path is a working Rscript by running --version.
 */
async function isExecutable(rscriptPath) {
    try {
        await execAsync(`"${rscriptPath}" --version`);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Try to find R's install directory from the Windows Registry.
 * R's CRAN installer writes to HKLM\SOFTWARE\R-core\R\InstallPath.
 * Returns the full path to Rscript.exe, or undefined.
 */
function getRscriptFromWindowsRegistry() {
    const regKeys = getRegistryKeys();
    for (const key of regKeys) {
        try {
            const result = (0, child_process_1.execSync)(`reg query "${key}" /v InstallPath`, { encoding: 'utf8', timeout: 5000 });
            const match = result.match(/InstallPath\s+REG_SZ\s+(.+)/);
            if (match) {
                const installDir = match[1].trim();
                const candidates = buildRscriptCandidates(installDir);
                for (const candidate of candidates) {
                    if (fs.existsSync(candidate)) {
                        return candidate;
                    }
                }
            }
        }
        catch {
            // Registry key doesn't exist or reg.exe failed — try next
        }
    }
    return undefined;
}
//# sourceMappingURL=utils.js.map