import * as vscode from 'vscode';
import { runRScript, isQuartoAvailable } from './utils';

/**
 * The two kinds of tutorial learnr2::available_tutorials() reports: a
 * Quarto document whose exercises run in the browser via WebR, or a classic
 * learnr R Markdown document that runs as a Shiny app.
 */
export type TutorialFormat = 'quarto' | 'rmarkdown';

/** Short, student-facing name for a format, shown next to each tutorial. */
export function formatLabel(format: TutorialFormat): string {
    return format === 'quarto' ? 'Quarto' : 'learnr';
}

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
        public readonly format: TutorialFormat,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = `${packageName} — ${tutorialId} (${formatLabel(format)} tutorial)`;
        // Tell students what to expect: a Quarto tutorial opens as a page
        // that runs in the browser; a learnr one starts a Shiny app.
        this.description = formatLabel(format);
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

export interface TutorialEntry {
    packageName: string;
    tutorialId: string;
    /** Human-readable title from the tutorial's YAML header; may be empty. */
    title: string;
    format: TutorialFormat;
}

/**
 * Parse the tab-separated output of the R listing script into sorted
 * tutorial entries. Each line is "package\tname\ttitle\tformat"; the title
 * field may be absent or empty for tutorials without a YAML title, and a
 * missing or unrecognised format field is taken to be a classic learnr
 * tutorial.
 * Pure function — easy to test.
 */
export function parseTutorialLines(stdout: string): TutorialEntry[] {
    const entries: TutorialEntry[] = [];
    for (const line of stdout.trim().split('\n')) {
        const parts = line.split('\t');
        if (parts.length >= 2) {
            entries.push({
                packageName: parts[0].trim(),
                tutorialId: parts[1].trim(),
                title: (parts[2] ?? '').trim(),
                format: (parts[3] ?? '').trim() === 'quarto' ? 'quarto' : 'rmarkdown'
            });
        }
    }
    // Sort by the tutorial's directory name (the id), not its display title:
    // package authors order their tutorials by naming the directories
    // (01-intro, 02-data, …), and that intended sequence should win.
    entries.sort((a, b) => {
        if (a.packageName !== b.packageName) {
            return a.packageName.localeCompare(b.packageName);
        }
        return a.tutorialId.localeCompare(b.tutorialId, undefined, { numeric: true });
    });
    return entries;
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
    /** The missing-Quarto warning is shown at most once per session. */
    private quartoWarned = false;

    /** Call after creating the tree view so the provider can show loading messages. */
    setTreeView(tv: vscode.TreeView<TreeNode>): void {
        this.treeView = tv;
    }

    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    async initialize(rscriptPath: string): Promise<void> {
        this.rscriptPath = rscriptPath;

        // Check that learnr2 is installed. It is the only R package the
        // extension needs: it lists and runs both Quarto and classic learnr
        // tutorials, and any package that bundles learnr tutorials already
        // depends on learnr itself.
        const learnr2Installed = await this.checkLearnr2();
        if (!learnr2Installed) {
            vscode.window.showErrorMessage(
                'The learnr2 package is not installed. Please install it with: install.packages("learnr2")',
                'Copy Install Command'
            ).then(selection => {
                if (selection === 'Copy Install Command') {
                    vscode.env.clipboard.writeText('install.packages("learnr2")');
                    vscode.window.showInformationMessage('Command copied to clipboard.');
                }
            });
            return;
        }

        await this.loadTutorials();
    }

    private async checkLearnr2(): Promise<boolean> {
        try {
            const { stdout } = await runRScript(
                'cat(requireNamespace("learnr2", quietly = TRUE))',
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
            // learnr2 scans every installed package for inst/tutorials/ and
            // reports both Quarto and classic learnr tutorials, with the
            // format of each. A directory with no document at all (format
            // NA) cannot be run, so it is left out.
            // Titles are free text, so strip the characters used as record
            // separators (tabs and newlines) before printing.
            const rCode =
`tutorials <- learnr2::available_tutorials()
for (i in seq_len(nrow(tutorials))) {
  format <- tutorials$format[i]
  if (is.na(format)) next
  title <- tutorials$title[i]
  if (is.na(title)) title <- ""
  title <- gsub("[\\t\\r\\n]+", " ", title)
  cat(tutorials$package[i], "\\t", tutorials$name[i], "\\t", title, "\\t", format, "\\n", sep = "")
}
`;
            const { stdout } = await runRScript(rCode, this.rscriptPath);

            this.tutorials = parseTutorialLines(stdout);
            this.warnIfQuartoMissing();

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

    /**
     * Quarto tutorials are rendered with the Quarto command line tool. If
     * any are installed but Quarto is not, say so once; the tutorials stay
     * listed so students can see what exists, and running one fails with
     * learnr2's own message.
     */
    private async warnIfQuartoMissing(): Promise<void> {
        if (this.quartoWarned || !this.tutorials.some(t => t.format === 'quarto')) {
            return;
        }
        if (await isQuartoAvailable()) {
            return;
        }
        this.quartoWarned = true;
        const selection = await vscode.window.showWarningMessage(
            'Some installed tutorials are Quarto tutorials, which need the Quarto ' +
            'command line tool to run. Install it from https://quarto.org.',
            'Download Quarto'
        );
        if (selection === 'Download Quarto') {
            vscode.env.openExternal(vscode.Uri.parse('https://quarto.org/docs/get-started/'));
        }
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
            // A title shared by several tutorials is ambiguous — show the
            // directory name (unique within a package) for all of them.
            const titleCounts = new Map<string, number>();
            for (const t of entries) {
                if (t.title) {
                    titleCounts.set(t.title, (titleCounts.get(t.title) ?? 0) + 1);
                }
            }
            return entries.map(t =>
                new TutorialItem(
                    t.title && titleCounts.get(t.title) === 1
                        ? t.title
                        : t.tutorialId,
                    t.packageName,
                    t.tutorialId,
                    t.format,
                    vscode.TreeItemCollapsibleState.None
                )
            );
        }

        return [];
    }
}
