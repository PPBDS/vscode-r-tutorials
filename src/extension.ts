import * as vscode from 'vscode';
import { TutorialProvider, TutorialItem, runnerFor } from './tutorialProvider';
import {
    runRScript,
    isValidName,
    resolveRscriptPath,
    buildRunCommand,
    buildInstallAndRunCommand,
    closeWelcomeTabs
} from './utils';

async function getMissingDeps(
    packageName: string,
    tutorialId: string,
    rscriptPath: string,
    useLearnr2: boolean = true
): Promise<string[]> {
    // learnr2 reports the R packages a tutorial needs installed locally:
    // none for a Quarto tutorial (its exercises run in the browser via
    // WebR), what learnr finds for a classic learnr tutorial, or NA when
    // learnr itself is missing and there is nothing to check.
    const rCode =
`tutorials <- ${useLearnr2 ? 'learnr2' : 'learnr'}::available_tutorials(package = "${packageName}")
row <- tutorials[tutorials$name == "${tutorialId}", ]
if (nrow(row) == 0) quit("no", status = 0)
deps <- row$package_dependencies[[1]]
if (is.null(deps) || length(deps) == 0 || anyNA(deps)) quit("no", status = 0)
missing <- deps[!sapply(deps, requireNamespace, quietly = TRUE)]
cat(paste(missing, collapse = "\\n"))
`;
    try {
        const { stdout } = await runRScript(rCode, rscriptPath);
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

    // Optionally close VS Code's Welcome tab so the editor area starts empty.
    // We activate on onStartupFinished, by which time the Welcome page is
    // normally open; the second, delayed attempt covers a slow window where
    // it appears a moment later. Off unless the setting says otherwise.
    if (vscode.workspace.getConfiguration('rTutorials').get<boolean>('closeWelcomeOnStartup', false)) {
        void closeWelcomeTabs().then(closed => {
            if (closed === 0) {
                setTimeout(() => { void closeWelcomeTabs(); }, 2000);
            }
        });
    }

    const tutorialProvider = new TutorialProvider();

    const treeView = vscode.window.createTreeView('rTutorialsList', {
        treeDataProvider: tutorialProvider,
        showCollapseAll: true
    });

    tutorialProvider.setTreeView(treeView);

    // Resolve R path, then initialize
    let rscriptPath: string = 'Rscript';  // fallback

    resolveRscriptPath().then(resolved => {
        if (!resolved) {
            vscode.window.showErrorMessage(
                'R is not installed or not found. ' +
                'Install R from https://cran.r-project.org or set the ' +
                '"rTutorials.rscriptPath" setting to the path of your Rscript executable.',
                'Download R',
                'Open Settings'
            ).then(selection => {
                if (selection === 'Download R') {
                    vscode.env.openExternal(vscode.Uri.parse('https://cran.r-project.org/'));
                } else if (selection === 'Open Settings') {
                    vscode.commands.executeCommand(
                        'workbench.action.openSettings', 'rTutorials.rscriptPath'
                    );
                }
            });
            return;
        }
        rscriptPath = resolved;
        tutorialProvider.initialize(rscriptPath);
    });

    // Re-resolve if the user changes the setting
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('rTutorials.rscriptPath')) {
                resolveRscriptPath().then(resolved => {
                    if (resolved) {
                        rscriptPath = resolved;
                        tutorialProvider.refresh(rscriptPath);
                    }
                });
            }
        })
    );

    const runTutorial = vscode.commands.registerCommand(
        'rTutorials.runTutorial',
        async (item: TutorialItem) => {
            if (!item || !item.packageName) { return; }
            const packageName: string = item.packageName;
            const tutorialId: string = item.tutorialId;

            if (!isValidName(packageName) || !isValidName(tutorialId)) {
                vscode.window.showErrorMessage(
                    `Invalid package or tutorial name: "${packageName}" / "${tutorialId}"`
                );
                return;
            }

            const runner = runnerFor(tutorialProvider.capabilities);
            const missing = await getMissingDeps(packageName, tutorialId, rscriptPath, runner === 'learnr2');

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
                terminal.sendText(
                    buildInstallAndRunCommand(rscriptPath, tutorialId, packageName, missing, runner)
                );
                return;
            }

            const terminal = vscode.window.createTerminal('R Tutorial');
            terminal.show();
            terminal.sendText(buildRunCommand(rscriptPath, tutorialId, packageName, runner));
        }
    );

    const refreshTutorials = vscode.commands.registerCommand(
        'rTutorials.refresh',
        () => tutorialProvider.refresh(rscriptPath)
    );

    context.subscriptions.push(treeView, runTutorial, refreshTutorials);
}

export function deactivate() {}
