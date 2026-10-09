import * as vscode from 'vscode';
import { runRScript, isQuartoAvailable, TutorialRunner } from './utils';

/**
 * The two kinds of tutorial the view lists: a learnr2 Quarto document whose
 * exercises run in the browser via WebR (listed and run by learnr2), or a
 * classic learnr R Markdown document that runs as a Shiny app (listed and
 * run by learnr).
 */
export type TutorialFormat = 'quarto' | 'rmarkdown';

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
        // The row is just the title; hovering shows the tutorial's directory
        // name (e.g. "05-r4ds-5"), which is how course materials refer to it.
        // The format is kept on the item for run-time use but not displayed.
        this.tooltip = tutorialId;
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

export interface TutorialEntry {
    packageName: string;
    tutorialId: string;
    /** Human-readable title from the tutorial's YAML header; may be empty. */
    title: string;
    format: TutorialFormat;
    /**
     * Position set by `learnr2: ordering:` in the tutorial's YAML header,
     * or null when it sets none (see learnr2's ?available_tutorials).
     */
    ordering: number | null;
}

/**
 * Which tutorial packages R has. learnr2 lists and runs Quarto tutorials;
 * learnr lists and runs classic ones. The two are independent, and the
 * view shows whatever the installed packages can run.
 */
export interface Capabilities {
    learnr2: boolean;
    learnr: boolean;
}

/** The tutorial formats that can be listed and run with `caps`. */
export function visibleFormats(caps: Capabilities): TutorialFormat[] {
    const formats: TutorialFormat[] = [];
    if (caps.learnr2) { formats.push('quarto'); }
    if (caps.learnr) { formats.push('rmarkdown'); }
    return formats;
}

/**
 * The extra line(s) for the loading message when one of the two packages
 * is missing, or '' when both are installed (nothing worth saying).
 */
export function capabilityNote(caps: Capabilities): string {
    if (caps.learnr2 && !caps.learnr) {
        return 'learnr is not installed,\nso only learnr2 (Quarto)\ntutorials are shown.\n\n';
    }
    if (!caps.learnr2 && caps.learnr) {
        return 'learnr2 is not installed,\nso only classic learnr\ntutorials are shown.\n\n';
    }
    return '';
}

/**
 * Which R package runs a tutorial of `format`: learnr2 for Quarto, learnr
 * for classic. learnr2 no longer hands classic tutorials to learnr, so the
 * extension calls each directly.
 */
export function runnerFor(format: TutorialFormat): TutorialRunner {
    return format === 'quarto' ? 'learnr2' : 'learnr';
}

/**
 * The R script that prints one tab-separated line per runnable tutorial:
 * "package\tname\ttitle\tformat\tordering". Quarto tutorials come from
 * learnr2 and classic ones from learnr, each only if that package is
 * installed. Only learnr2's "quarto" rows are kept: learnr2 releases before
 * 0.1.3.9003 also listed classic tutorials, and those are learnr's to list.
 * A directory with both documents is claimed by learnr2 and not listed
 * again. Only learnr2 tutorials carry an `ordering`; classic ones never do.
 * Titles are free text, so the record separators are stripped. Rows are
 * read with `$` and an index, never `[`-subset, because learnr's listing
 * has a class whose methods break when columns are dropped. Pure function.
 */
export function listingScript(caps: Capabilities): string {
    let code =
`emit <- function(pkg, name, title, format, ordering) {
  title <- if (is.null(title) || is.na(title)) "" else gsub("[\\t\\r\\n]+", " ", title)
  ordering <- if (is.null(ordering) || is.na(ordering)) "" else ordering
  cat(pkg, "\\t", name, "\\t", title, "\\t", format, "\\t", ordering, "\\n", sep = "")
}
seen <- character(0)
`;
    if (caps.learnr2) {
        code +=
`t2 <- learnr2::available_tutorials()
for (i in seq_len(nrow(t2))) {
  if (is.na(t2$format[i]) || t2$format[i] != "quarto") next
  emit(t2$package[i], t2$name[i], t2$title[i], "quarto",
       if (is.null(t2$ordering)) NA else t2$ordering[i])
  seen <- c(seen, paste(t2$package[i], t2$name[i]))
}
`;
    }
    if (caps.learnr) {
        code +=
`t1 <- tryCatch(learnr::available_tutorials(), error = function(e) NULL)
if (!is.null(t1)) for (i in seq_len(nrow(t1))) {
  if (paste(t1$package[i], t1$name[i]) %in% seen) next
  emit(t1$package[i], t1$name[i], t1$title[i], "rmarkdown", NA)
}
`;
    }
    return code;
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
            const rawOrdering = (parts[4] ?? '').trim();
            const ordering = rawOrdering === '' ? NaN : Number(rawOrdering);
            entries.push({
                packageName: parts[0].trim(),
                tutorialId: parts[1].trim(),
                title: (parts[2] ?? '').trim(),
                format: (parts[3] ?? '').trim() === 'quarto' ? 'quarto' : 'rmarkdown',
                ordering: Number.isFinite(ordering) ? ordering : null
            });
        }
    }
    // Within a package: tutorials that set `learnr2: ordering:` come first,
    // lowest first; then the rest by directory name (the id), not display
    // title — authors order tutorials by naming directories (01-intro,
    // 02-data, …). The directory name also breaks ties between equal
    // orderings.
    entries.sort((a, b) => {
        if (a.packageName !== b.packageName) {
            return a.packageName.localeCompare(b.packageName);
        }
        if (a.ordering !== null || b.ordering !== null) {
            if (a.ordering === null) { return 1; }
            if (b.ordering === null) { return -1; }
            if (a.ordering !== b.ordering) { return a.ordering - b.ordering; }
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
    /** What R has; set on initialize. */
    public capabilities: Capabilities = { learnr2: true, learnr: true };
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

        // learnr2 runs Quarto tutorials and learnr runs classic ones. Show
        // what the installed packages can run, and say what is missing in
        // the loading message.
        this.capabilities = await this.checkCapabilities();
        if (!this.capabilities.learnr2 && !this.capabilities.learnr) {
            // learnr2 is not on CRAN; it is installed from GitHub.
            const installCommand = 'install.packages("pak"); pak::pak("PPBDS/learnr2")';
            vscode.window.showErrorMessage(
                'Neither learnr2 nor learnr is installed, so there are no tutorials to show. ' +
                'Install learnr2 from GitHub by running this in R: ' + installCommand,
                'Copy Install Command'
            ).then(selection => {
                if (selection === 'Copy Install Command') {
                    vscode.env.clipboard.writeText(installCommand);
                    vscode.window.showInformationMessage('Command copied to clipboard.');
                }
            });
            return;
        }

        await this.loadTutorials();
    }

    private async checkCapabilities(): Promise<Capabilities> {
        try {
            const { stdout } = await runRScript(
                'cat(requireNamespace("learnr2", quietly = TRUE), requireNamespace("learnr", quietly = TRUE))',
                this.rscriptPath
            );
            const [l2, l] = stdout.trim().split(/\s+/);
            return { learnr2: l2 === 'TRUE', learnr: l === 'TRUE' };
        } catch {
            return { learnr2: false, learnr: false };
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
            this.treeView.message =
                capabilityNote(this.capabilities) + TutorialProvider.LOADING_MESSAGE;
        }

        try {
            // Quarto tutorials from learnr2 and classic ones from learnr,
            // each only if installed (see listingScript).
            const rCode = listingScript(this.capabilities);
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

    /**
     * The format of a listed tutorial, or undefined if it is not listed.
     * The run command normally gets it from the tree item; this covers a
     * caller passing only the package and tutorial names.
     */
    formatOf(packageName: string, tutorialId: string): TutorialFormat | undefined {
        return this.packageMap.get(packageName)
            ?.find(t => t.tutorialId === tutorialId)?.format;
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
