import * as vscode from 'vscode';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

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
    const tmpFile = path.join(os.tmpdir(), `r-tutorials-${Date.now()}.R`);
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
// R path discovery
// ---------------------------------------------------------------------------

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
        // User set a path but it doesn't work — warn them
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
    // Try 64-bit registry first, then 32-bit
    const regKeys = [
        'HKLM\\SOFTWARE\\R-core\\R',
        'HKLM\\SOFTWARE\\WOW6432Node\\R-core\\R'
    ];

    for (const key of regKeys) {
        try {
            const result = execSync(
                `reg query "${key}" /v InstallPath`,
                { encoding: 'utf8', timeout: 5000 }
            );
            // Output looks like:
            //     InstallPath    REG_SZ    C:\Program Files\R\R-4.4.0
            const match = result.match(/InstallPath\s+REG_SZ\s+(.+)/);
            if (match) {
                const installDir = match[1].trim();
                // Prefer x64 Rscript if it exists
                const candidates = [
                    path.join(installDir, 'bin', 'x64', 'Rscript.exe'),
                    path.join(installDir, 'bin', 'Rscript.exe')
                ];
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
