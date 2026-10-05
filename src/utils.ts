import * as vscode from 'vscode';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

// Monotonic counter to guarantee unique temp-file names even if two calls
// land in the same millisecond.
let tmpFileCounter = 0;

// ---------------------------------------------------------------------------
// R script execution
// ---------------------------------------------------------------------------

interface RScriptResult {
    stdout: string;
    stderr: string;
}

/**
 * Run an R script via Rscript, using a temp file to avoid shell quoting issues.
 * Returns both stdout and stderr so callers can surface R-level diagnostics.
 */
export async function runRScript(code: string, rscriptPath: string): Promise<RScriptResult> {
    const tmpFile = path.join(
        os.tmpdir(),
        `r-tutorials-${process.pid}-${Date.now()}-${tmpFileCounter++}.R`
    );
    fs.writeFileSync(tmpFile, code, 'utf8');
    try {
        const { stdout, stderr } = await execAsync(`"${rscriptPath}" "${tmpFile}"`);
        return { stdout, stderr };
    } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
    }
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const SAFE_NAME_RE = /^[a-zA-Z0-9._\-]+$/;

export function isValidName(name: string): boolean {
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
export function shellQuote(p: string): string {
    if (p.includes(' ') || p.includes('\\')) {
        return `"${p}"`;
    }
    return p;
}

// ---------------------------------------------------------------------------
// Terminal command building (pure functions — easy to test)
// ---------------------------------------------------------------------------

/**
 * The R call that runs a tutorial. learnr2::run_tutorial() dispatches on the
 * tutorial's format itself: a Quarto tutorial is rendered and served, a
 * classic learnr (.Rmd) tutorial is handed to learnr::run_tutorial(). The
 * explicit `open = TRUE` matters because the default is `interactive()`,
 * which is FALSE under Rscript.
 */
function runTutorialCall(tutorialId: string, packageName: string): string {
    return `learnr2::run_tutorial('${tutorialId}', package = '${packageName}', open = TRUE)`;
}

/**
 * Build the terminal command to run a tutorial.
 */
export function buildRunCommand(
    rscriptPath: string,
    tutorialId: string,
    packageName: string
): string {
    const quoted = shellQuote(rscriptPath);
    return `${quoted} -e "${runTutorialCall(tutorialId, packageName)}"`;
}

/**
 * Build the terminal command to install missing packages then run a tutorial.
 */
export function buildInstallAndRunCommand(
    rscriptPath: string,
    tutorialId: string,
    packageName: string,
    missingPackages: string[]
): string {
    const quoted = shellQuote(rscriptPath);
    const installCmd = missingPackages.map(p => `'${p}'`).join(', ');
    return `${quoted} -e "install.packages(c(${installCmd}), repos = 'https://cloud.r-project.org'); ${runTutorialCall(tutorialId, packageName)}"`;
}

// ---------------------------------------------------------------------------
// Quarto discovery
// ---------------------------------------------------------------------------

/**
 * Whether the Quarto command line tool is on PATH. Quarto-format tutorials
 * (learnr2's own) are rendered with it; classic learnr tutorials do not
 * need it.
 */
export async function isQuartoAvailable(): Promise<boolean> {
    try {
        await execAsync('quarto --version');
        return true;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// R path discovery
// ---------------------------------------------------------------------------

/**
 * Given an R install directory, return candidate Rscript paths in preference
 * order. This is a pure function so it can be tested on any platform.
 */
export function buildRscriptCandidates(installDir: string): string[] {
    return [
        path.join(installDir, 'bin', 'x64', 'Rscript.exe'),
        path.join(installDir, 'bin', 'Rscript.exe')
    ];
}

/**
 * Return the Windows Registry keys to search for R's install path, in order.
 * Pure function — testable on any platform.
 */
export function getRegistryKeys(): string[] {
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
export async function resolveRscriptPath(): Promise<string | undefined> {

    // 1. Check user setting
    const config = vscode.workspace.getConfiguration('rTutorials');
    const userPath = config.get<string>('rscriptPath', '').trim();
    if (userPath.length > 0) {
        if (await isExecutable(userPath)) {
            return userPath;
        }
        vscode.window.showWarningMessage(
            `The configured Rscript path "${userPath}" is not valid. Trying auto-detection…`
        );
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
async function isExecutable(rscriptPath: string): Promise<boolean> {
    try {
        await execAsync(`"${rscriptPath}" --version`);
        return true;
    } catch {
        return false;
    }
}

/**
 * Try to find R's install directory from the Windows Registry.
 * R's CRAN installer writes to HKLM\SOFTWARE\R-core\R\InstallPath.
 * Returns the full path to Rscript.exe, or undefined.
 */
function getRscriptFromWindowsRegistry(): string | undefined {
    const regKeys = getRegistryKeys();

    for (const key of regKeys) {
        try {
            const result = execSync(
                `reg query "${key}" /v InstallPath`,
                { encoding: 'utf8', timeout: 5000 }
            );
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
        } catch {
            // Registry key doesn't exist or reg.exe failed — try next
        }
    }

    return undefined;
}
