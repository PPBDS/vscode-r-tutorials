import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export class TutorialItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly packageName: string,
        public readonly tutorialId: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = `${packageName} - ${tutorialId}`;
        this.description = '';
        this.iconPath = new vscode.ThemeIcon('play');
    }
}

interface TutorialEntry {
    packageName: string;
    tutorialId: string;
}

export class TutorialProvider implements vscode.TreeDataProvider<TutorialItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<TutorialItem | undefined | null | void> =
        new vscode.EventEmitter<TutorialItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TutorialItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private tutorials: TutorialEntry[] = [];
    private rPath: string = 'Rscript';

    async initialize(): Promise<boolean> {
        const rInstalled = await this.checkR();
        if (!rInstalled) {
            vscode.window.showErrorMessage(
                'R is not installed or not found in PATH. Please install R to use this extension.',
                'Download R'
            ).then(selection => {
                if (selection === 'Download R') {
                    vscode.env.openExternal(vscode.Uri.parse('https://cran.r-project.org/'));
                }
            });
            return false;
        }

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
            return false;
        }

        await this.loadTutorials();
        return true;
    }

    private async checkR(): Promise<boolean> {
        try {
            await execAsync(`${this.rPath} --version`);
            return true;
        } catch {
            return false;
        }
    }

    private async checkLearnr(): Promise<boolean> {
        try {
            const { stdout } = await execAsync(
                `${this.rPath} -e "cat(requireNamespace('learnr', quietly = TRUE))"`
            );
            return stdout.trim() === 'TRUE';
        } catch {
            return false;
        }
    }

    private async runRScript(code: string): Promise<string> {
        const tmpFile = path.join(os.tmpdir(), `r-tutorials-${Date.now()}.R`);
        fs.writeFileSync(tmpFile, code, 'utf8');
        try {
            const { stdout } = await execAsync(`${this.rPath} "${tmpFile}"`);
            return stdout;
        } finally {
            try { fs.unlinkSync(tmpFile); } catch {}
        }
    }

    private async loadTutorials(): Promise<void> {
        try {
            const rCode =
`tutorials <- learnr::available_tutorials()
for (i in seq_len(nrow(tutorials))) {
  cat(tutorials$package[i], "\\t", tutorials$name[i], "\\n", sep = "")
}
`;
            const stdout = await this.runRScript(rCode);
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
                const labelA = `${a.packageName} - ${a.tutorialId}`;
                const labelB = `${b.packageName} - ${b.tutorialId}`;
                return labelA.localeCompare(labelB);
            });
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to load tutorials: ${err.message}`);
            this.tutorials = [];
        }
        this._onDidChangeTreeData.fire();
    }

    refresh(): void {
        this.loadTutorials();
    }

    getTreeItem(element: TutorialItem): vscode.TreeItem {
        return element;
    }

    getChildren(): TutorialItem[] {
        return this.tutorials.map(t =>
            new TutorialItem(
                `${t.packageName} - ${t.tutorialId}`,
                t.packageName,
                t.tutorialId,
                vscode.TreeItemCollapsibleState.None
            )
        );
    }
}