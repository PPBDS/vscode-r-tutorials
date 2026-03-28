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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const tutorialProvider_1 = require("./tutorialProvider");
const utils_1 = require("./utils");
async function getMissingDeps(packageName, tutorialId, rscriptPath) {
    const rCode = `tutorials <- learnr::available_tutorials(package = "${packageName}")
row <- tutorials[tutorials$name == "${tutorialId}", ]
if (nrow(row) == 0) quit("no", status = 0)
deps <- row$package_dependencies[[1]]
if (is.null(deps) || length(deps) == 0) quit("no", status = 0)
missing <- deps[!sapply(deps, requireNamespace, quietly = TRUE)]
cat(paste(missing, collapse = "\\n"))
`;
    try {
        const { stdout } = await (0, utils_1.runRScript)(rCode, rscriptPath);
        const trimmed = stdout.trim();
        if (trimmed.length === 0) {
            return [];
        }
        return trimmed.split('\n').filter(p => p.length > 0);
    }
    catch {
        return [];
    }
}
function activate(context) {
    const tutorialProvider = new tutorialProvider_1.TutorialProvider();
    const treeView = vscode.window.createTreeView('rTutorialsList', {
        treeDataProvider: tutorialProvider,
        showCollapseAll: true
    });
    tutorialProvider.setTreeView(treeView);
    // Resolve R path, then initialize
    let rscriptPath = 'Rscript'; // fallback
    (0, utils_1.resolveRscriptPath)().then(resolved => {
        if (!resolved) {
            vscode.window.showErrorMessage('R is not installed or not found. ' +
                'Install R from https://cran.r-project.org or set the ' +
                '"rTutorials.rscriptPath" setting to the path of your Rscript executable.', 'Download R', 'Open Settings').then(selection => {
                if (selection === 'Download R') {
                    vscode.env.openExternal(vscode.Uri.parse('https://cran.r-project.org/'));
                }
                else if (selection === 'Open Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'rTutorials.rscriptPath');
                }
            });
            return;
        }
        rscriptPath = resolved;
        tutorialProvider.initialize(rscriptPath);
    });
    // Re-resolve if the user changes the setting
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('rTutorials.rscriptPath')) {
            (0, utils_1.resolveRscriptPath)().then(resolved => {
                if (resolved) {
                    rscriptPath = resolved;
                    tutorialProvider.refresh(rscriptPath);
                }
            });
        }
    }));
    const runTutorial = vscode.commands.registerCommand('rTutorials.runTutorial', async (item) => {
        if (!item || !item.packageName) {
            return;
        }
        const packageName = item.packageName;
        const tutorialId = item.tutorialId;
        if (!(0, utils_1.isValidName)(packageName) || !(0, utils_1.isValidName)(tutorialId)) {
            vscode.window.showErrorMessage(`Invalid package or tutorial name: "${packageName}" / "${tutorialId}"`);
            return;
        }
        const missing = await getMissingDeps(packageName, tutorialId, rscriptPath);
        if (missing.length > 0) {
            const selection = await vscode.window.showWarningMessage(`Tutorial "${tutorialId}" requires missing packages: ${missing.join(', ')}. Install them?`, 'Install and Run', 'Cancel');
            if (selection !== 'Install and Run') {
                return;
            }
            const terminal = vscode.window.createTerminal('R Tutorial');
            terminal.show();
            terminal.sendText((0, utils_1.buildInstallAndRunCommand)(rscriptPath, tutorialId, packageName, missing));
            return;
        }
        const terminal = vscode.window.createTerminal('R Tutorial');
        terminal.show();
        terminal.sendText((0, utils_1.buildRunCommand)(rscriptPath, tutorialId, packageName));
    });
    const refreshTutorials = vscode.commands.registerCommand('rTutorials.refresh', () => tutorialProvider.refresh(rscriptPath));
    context.subscriptions.push(treeView, runTutorial, refreshTutorials);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map