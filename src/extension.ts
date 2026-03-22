import * as vscode from 'vscode';
import { TutorialProvider } from './tutorialProvider';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

async function runRScript(code: string): Promise<string> {
    const tmpFile = path.join(os.tmpdir(), `r-tutorials-${Date.now()}.R`);
    fs.writeFileSync(tmpFile, code, 'utf8');
    try {
        const { stdout } = await execAsync(`Rscript "${tmpFile}"`);
        return stdout;
    } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
    }
}

async function getMissingDeps(packageName: string, tutorialId: string): Promise<string[]> {
    const rCode =
`tutorials <- learnr::available_tutorials(package = "${packageName}")
row <- tutorials[tutorials$name == "${tutorialId}", ]
if (nrow(row) == 0) quit("no", status = 0)
deps <- row$package_dependencies[[1]]
if (is.null(deps) || length(deps) == 0) quit("no", status = 0)
missing <- deps[!sapply(deps, requireNamespace, quietly = TRUE)]
cat(paste(missing, collapse = "\\n"))
`;
    try {
        const stdout = await runRScript(rCode);
        const trimmed = stdout.trim();
        if (trimmed.length === 0) {
            return [];
        }
        return trimmed.split('\n').filter(p => p.length > 0);
    } catch {
        return [];
    }
}

export function activate(context: vscode.ExtensionContext) {

    const tutorialProvider = new TutorialProvider();

    const treeView = vscode.window.createTreeView('rTutorialsList', {
        treeDataProvider: tutorialProvider,
        showCollapseAll: false
    });

    tutorialProvider.initialize();

    const runTutorial = vscode.commands.registerCommand(
        'rTutorials.runTutorial',
        async (packageName: string, tutorialId: string) => {

            const missing = await getMissingDeps(packageName, tutorialId);

            if (missing.length > 0) {
                const selection = await vscode.window.showWarningMessage(
                    `Tutorial "${tutorialId}" requires missing packages: ${missing.join(', ')}. Install them?`,
                    'Install and Run',
                    'Cancel'
                );
                if (selection !== 'Install and Run') {
                    return;
                }
				const terminal = vscode.window.createTerminal('R Tutorial');
                terminal.show();
                const installCmd = missing.map(p => `'${p}'`).join(', ');
                terminal.sendText(
                    `Rscript -e "install.packages(c(${installCmd}), repos = 'https://cloud.r-project.org'); learnr::run_tutorial('${tutorialId}', package = '${packageName}')"`
                );
            }

            const terminal = vscode.window.createTerminal('R Tutorial');
            terminal.show();
            terminal.sendText(
                `Rscript -e "learnr::run_tutorial('${tutorialId}', package = '${packageName}')"`
            );
        }
    );

    const refreshTutorials = vscode.commands.registerCommand(
        'rTutorials.refresh',
        () => tutorialProvider.refresh()
    );

    context.subscriptions.push(treeView, runTutorial, refreshTutorials);
}

export function deactivate() {}