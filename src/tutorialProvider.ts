import * as vscode from 'vscode';
import { runRScript } from './utils';

// ---------------------------------------------------------------------------
// Tree items
// ---------------------------------------------------------------------------

export class PackageItem extends vscode.TreeItem {
    public readonly contextValue = 'package';

    constructor(
        public readonly packageName: string,
        public readonly tutorialCount: number
    ) {
        super(packageName, vscode.TreeItemCollapsibleState.Collapsed);
        this.description = `${tutorialCount} tutorial${tutorialCount === 1 ? '' : 's'}`;
        this.iconPath = new vscode.ThemeIcon('package');
    }
}

export class TutorialItem extends vscode.TreeItem {
    public readonly contextValue = 'tutorial';

    constructor(
        public readonly label: string,
        public readonly packageName: string,
        public readonly tutorialId: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = `${packageName} — ${tutorialId}`;
        this.description = '';
        // A small dot marks each tutorial. The run action is the inline play
        // button on the right; a left-hand play icon here would be a confusing
        // second triangle that does nothing when clicked.
        this.iconPath = new vscode.ThemeIcon('circle-small-filled');
    }
}

type TreeNode = PackageItem | TutorialItem;

// ---------------------------------------------------------------------------
// Internal data
// ---------------------------------------------------------------------------

interface TutorialEntry {
    packageName: string;
    tutorialId: string;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class TutorialProvider implements vscode.TreeDataProvider<TreeNode> {

    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> =
        new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private tutorials: TutorialEntry[] = [];
    private packageMap: Map<string, TutorialEntry[]> = new Map();
    private rscriptPath: string = 'Rscript';
    private treeView: vscode.TreeView<TreeNode> | undefined;

    /** Call after creating the tree view so the provider can show loading messages. */
    setTreeView(tv: vscode.TreeView<TreeNode>): void {
        this.treeView = tv;
    }

    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    async initialize(rscriptPath: string): Promise<void> {
        this.rscriptPath = rscriptPath;

        // Check that learnr is installed
        const learnrInstalled = await this.checkLearnr();
        if (!learnrInstalled) {
            vscode.window.showErrorMessage(
                'The learnr package is not installed. Please install it with: install.packages("learnr")',
                'Copy Install Command'
            ).then(selection => {
                if (selection === 'Copy Install Command') {
                    vscode.env.clipboard.writeText('install.packages("learnr")');
                    vscode.window.showInformationMessage('Command copied to clipboard.');
                }
            });
            return;
        }

        await this.loadTutorials();
    }

    private async checkLearnr(): Promise<boolean> {
        try {
            const { stdout } = await runRScript(
                'cat(requireNamespace("learnr", quietly = TRUE))',
                this.rscriptPath
            );
            return stdout.trim() === 'TRUE';
        } catch {
            return false;
        }
    }

    // -----------------------------------------------------------------------
    // Loading tutorials
    // -----------------------------------------------------------------------

    /**
     * Shown in the view's message area while tutorials load. The panel is
     * narrow, so each instruction is split across two short lines to avoid
     * awkward mid-word wrapping.
     */
    private static readonly LOADING_MESSAGE =
        'Loading packages…\n\n' +
        'To find a tutorial,\n' +
        'select its package.\n\n' +
        'To run a tutorial, select it,\n' +
        'then click the arrow on the right.';

    private async loadTutorials(): Promise<void> {
        if (this.treeView) {
            this.treeView.message = TutorialProvider.LOADING_MESSAGE;
        }

        try {
            const rCode =
`tutorials <- learnr::available_tutorials()
for (i in seq_len(nrow(tutorials))) {
  cat(tutorials$package[i], "\\t", tutorials$name[i], "\\n", sep = "")
}
`;
            const { stdout } = await runRScript(rCode, this.rscriptPath);

            this.tutorials = [];
            const lines = stdout.trim().split('\n');
            for (const line of lines) {
                const parts = line.split('\t');
                if (parts.length === 2) {
                    this.tutorials.push({
                        packageName: parts[0].trim(),
                        tutorialId: parts[1].trim()
                    });
                }
            }
            this.tutorials.sort((a, b) => {
                if (a.packageName !== b.packageName) {
                    return a.packageName.localeCompare(b.packageName);
                }
                return a.tutorialId.localeCompare(b.tutorialId);
            });

            // Build grouped map
            this.packageMap = new Map();
            for (const t of this.tutorials) {
                let arr = this.packageMap.get(t.packageName);
                if (!arr) {
                    arr = [];
                    this.packageMap.set(t.packageName, arr);
                }
                arr.push(t);
            }

        } catch (err: any) {
            const rStderr = err?.stderr ? `\nR output: ${err.stderr.trim()}` : '';
            vscode.window.showErrorMessage(
                `Failed to load tutorials: ${err.message}${rStderr}`
            );
            this.tutorials = [];
            this.packageMap = new Map();
        }

        if (this.treeView) {
            this.treeView.message = undefined;
        }
        this._onDidChangeTreeData.fire();
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    refresh(rscriptPath?: string): void {
        if (rscriptPath) {
            this.rscriptPath = rscriptPath;
        }
        this.loadTutorials();
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeNode): TreeNode[] {
        if (!element) {
            const packages = Array.from(this.packageMap.keys()).sort();
            return packages.map(pkg =>
                new PackageItem(pkg, this.packageMap.get(pkg)!.length)
            );
        }

        if (element instanceof PackageItem) {
            const entries = this.packageMap.get(element.packageName) || [];
            return entries.map(t =>
                new TutorialItem(
                    t.tutorialId,
                    t.packageName,
                    t.tutorialId,
                    vscode.TreeItemCollapsibleState.None
                )
            );
        }

        return [];
    }
}
