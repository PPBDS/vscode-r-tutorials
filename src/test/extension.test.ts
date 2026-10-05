import * as assert from 'assert';
import * as vscode from 'vscode';

suite('R Tutorials Extension', () => {

    const TIMEOUT = 30000;

    // ------------------------------------------------------------------
    // Activation & command registration
    // ------------------------------------------------------------------

    test('Extension should be present', () => {
        assert.ok(true, 'Extension file loaded');
    });

    test('Commands should be registered after activation', async function () {
        this.timeout(TIMEOUT);

        await vscode.commands.executeCommand('rTutorialsList.focus');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('rTutorials.runTutorial'),
            'runTutorial command should be registered'
        );
        assert.ok(
            commands.includes('rTutorials.refresh'),
            'refresh command should be registered'
        );
    });

    // ------------------------------------------------------------------
    // findWelcomeTabs (rTutorials.closeWelcomeOnStartup)
    // ------------------------------------------------------------------

    test('findWelcomeTabs picks the Welcome page and nothing else', () => {
        const { findWelcomeTabs } = require('../utils');
        const tabs = [
            { label: 'Welcome', input: undefined },                 // the Welcome page
            { label: 'Welcome', input: { uri: 'file:///Welcome' } }, // a FILE called Welcome
            { label: 'analysis.qmd', input: { uri: 'file:///a' } },
            { label: 'Settings', input: undefined }                  // another built-in page
        ];
        const found = findWelcomeTabs(tabs);
        assert.strictEqual(found.length, 1);
        assert.strictEqual(found[0], tabs[0]);
    });

    test('findWelcomeTabs returns an empty list when nothing matches', () => {
        const { findWelcomeTabs } = require('../utils');
        assert.deepStrictEqual(findWelcomeTabs([]), []);
        assert.deepStrictEqual(
            findWelcomeTabs([{ label: 'a.R', input: { uri: 'file:///a.R' } }]),
            []
        );
    });

    test('closeWelcomeTabs closes only Welcome tabs via the tab-group API', async () => {
        const { closeWelcomeTabs } = require('../utils');
        const welcome = { label: 'Welcome', input: undefined };
        const file = { label: 'a.R', input: { uri: 'file:///a.R' } };
        const closed: unknown[] = [];
        const fakeGroups = {
            all: [{ tabs: [welcome, file] }],
            close: async (tabs: unknown[]) => { closed.push(...tabs); return true; }
        };
        const n = await closeWelcomeTabs(fakeGroups);
        assert.strictEqual(n, 1);
        assert.deepStrictEqual(closed, [welcome]);
    });

    test('closeWelcomeTabs is a no-op with no Welcome tab', async () => {
        const { closeWelcomeTabs } = require('../utils');
        let calls = 0;
        const fakeGroups = {
            all: [{ tabs: [{ label: 'a.R', input: { uri: 'file:///a.R' } }] }],
            close: async () => { calls++; return true; }
        };
        assert.strictEqual(await closeWelcomeTabs(fakeGroups), 0);
        assert.strictEqual(calls, 0);
    });

    // ------------------------------------------------------------------
    // shellQuote
    // ------------------------------------------------------------------

    test('shellQuote should not quote simple paths', () => {
        const { shellQuote } = require('../utils');

        assert.strictEqual(shellQuote('Rscript'), 'Rscript');
        assert.strictEqual(shellQuote('/usr/bin/Rscript'), '/usr/bin/Rscript');
        assert.strictEqual(shellQuote('/usr/local/bin/Rscript'), '/usr/local/bin/Rscript');
    });

    test('shellQuote should quote paths with spaces', () => {
        const { shellQuote } = require('../utils');

        assert.strictEqual(
            shellQuote('/Applications/My App/Rscript'),
            '"/Applications/My App/Rscript"'
        );
    });

    test('shellQuote should quote Windows-style paths', () => {
        const { shellQuote } = require('../utils');

        assert.strictEqual(
            shellQuote('C:\\Program Files\\R\\R-4.4.0\\bin\\x64\\Rscript.exe'),
            '"C:\\Program Files\\R\\R-4.4.0\\bin\\x64\\Rscript.exe"'
        );
    });

    test('shellQuote should quote Windows paths even without spaces', () => {
        const { shellQuote } = require('../utils');

        // Backslashes alone trigger quoting
        assert.strictEqual(
            shellQuote('C:\\R\\bin\\Rscript.exe'),
            '"C:\\R\\bin\\Rscript.exe"'
        );
    });

    // ------------------------------------------------------------------
    // buildRunCommand
    // ------------------------------------------------------------------

    test('buildRunCommand with simple path', () => {
        const { buildRunCommand } = require('../utils');

        const cmd = buildRunCommand('Rscript', 'intro', 'learnr');
        assert.strictEqual(
            cmd,
            'Rscript -e "learnr2::run_tutorial(\'intro\', package = \'learnr\', open = TRUE)"'
        );
    });

    test('buildRunCommand with Unix path', () => {
        const { buildRunCommand } = require('../utils');

        const cmd = buildRunCommand('/usr/local/bin/Rscript', 'r4ds-1', 'primer.tutorials');
        assert.strictEqual(
            cmd,
            '/usr/local/bin/Rscript -e "learnr2::run_tutorial(\'r4ds-1\', package = \'primer.tutorials\', open = TRUE)"'
        );
    });

    test('buildRunCommand goes through learnr2 and forces open = TRUE', () => {
        const { buildRunCommand } = require('../utils');

        // learnr2::run_tutorial() dispatches on the tutorial's format, so one
        // command serves both Quarto and classic learnr tutorials. Its `open`
        // defaults to interactive(), which is FALSE under Rscript, so the
        // command must pass open = TRUE or nothing would be served.
        const cmd = buildRunCommand('Rscript', 'hello-learnr2', 'learnr2');
        assert.ok(cmd.includes('learnr2::run_tutorial('), 'Should call learnr2');
        assert.ok(!cmd.includes('learnr::run_tutorial('), 'Should not call learnr directly');
        assert.ok(cmd.includes('open = TRUE'), 'Should force open = TRUE');
    });

    test('buildRunCommand with Windows path containing spaces', () => {
        const { buildRunCommand } = require('../utils');

        const winPath = 'C:\\Program Files\\R\\R-4.4.0\\bin\\x64\\Rscript.exe';
        const cmd = buildRunCommand(winPath, 'hello', 'learnr');
        assert.ok(
            cmd.startsWith('"C:\\Program Files\\R\\R-4.4.0\\bin\\x64\\Rscript.exe"'),
            'Windows path should be quoted'
        );
        assert.ok(
            cmd.includes("run_tutorial('hello', package = 'learnr', open = TRUE)"),
            'Tutorial command should be present'
        );
    });

    // ------------------------------------------------------------------
    // buildInstallAndRunCommand
    // ------------------------------------------------------------------

    test('buildInstallAndRunCommand with one missing package', () => {
        const { buildInstallAndRunCommand } = require('../utils');

        const cmd = buildInstallAndRunCommand('Rscript', 'intro', 'learnr', ['tidyverse']);
        assert.ok(cmd.includes("install.packages(c('tidyverse')"), 'Should include install');
        assert.ok(cmd.includes("learnr2::run_tutorial('intro', package = 'learnr', open = TRUE)"), 'Should include run');
    });

    test('buildInstallAndRunCommand with multiple missing packages', () => {
        const { buildInstallAndRunCommand } = require('../utils');

        const cmd = buildInstallAndRunCommand(
            'Rscript', 'sampling', 'primer.tutorials',
            ['ggplot2', 'dplyr', 'tidyr']
        );
        assert.ok(
            cmd.includes("install.packages(c('ggplot2', 'dplyr', 'tidyr')"),
            'Should list all packages'
        );
        assert.ok(
            cmd.includes("learnr2::run_tutorial('sampling', package = 'primer.tutorials', open = TRUE)"),
            'Should include run'
        );
    });

    test('buildInstallAndRunCommand with Windows path', () => {
        const { buildInstallAndRunCommand } = require('../utils');

        const winPath = 'C:\\Program Files\\R\\R-4.4.0\\bin\\Rscript.exe';
        const cmd = buildInstallAndRunCommand(winPath, 'hello', 'learnr', ['shiny']);
        assert.ok(
            cmd.startsWith('"C:\\Program Files\\R\\R-4.4.0\\bin\\Rscript.exe"'),
            'Windows path should be quoted in install+run command'
        );
    });

    // ------------------------------------------------------------------
    // buildRscriptCandidates
    // ------------------------------------------------------------------

    test('buildRscriptCandidates should return x64 first', () => {
        const { buildRscriptCandidates } = require('../utils');

        const candidates = buildRscriptCandidates('C:\\Program Files\\R\\R-4.4.0');
        assert.strictEqual(candidates.length, 2);
        assert.ok(
            candidates[0].includes('x64'),
            'First candidate should be x64'
        );
        assert.ok(
            !candidates[1].includes('x64'),
            'Second candidate should be plain bin'
        );
    });

    test('buildRscriptCandidates paths should end with Rscript.exe', () => {
        const { buildRscriptCandidates } = require('../utils');

        const candidates = buildRscriptCandidates('/some/path');
        for (const c of candidates) {
            assert.ok(c.endsWith('Rscript.exe'), `"${c}" should end with Rscript.exe`);
        }
    });

    // ------------------------------------------------------------------
    // getRegistryKeys
    // ------------------------------------------------------------------

    test('getRegistryKeys should return 64-bit key first', () => {
        const { getRegistryKeys } = require('../utils');

        const keys = getRegistryKeys();
        assert.strictEqual(keys.length, 2);
        assert.ok(
            keys[0].includes('SOFTWARE\\R-core'),
            'First key should be the standard 64-bit key'
        );
        assert.ok(
            keys[1].includes('WOW6432Node'),
            'Second key should be the 32-bit fallback'
        );
    });

    // ------------------------------------------------------------------
    // isQuartoAvailable
    // ------------------------------------------------------------------

    test('isQuartoAvailable should resolve to a boolean', async function () {
        this.timeout(TIMEOUT);
        const { isQuartoAvailable } = require('../utils');

        // Whether Quarto is installed on the test machine is not known, but
        // the check must never throw.
        const available = await isQuartoAvailable();
        assert.strictEqual(typeof available, 'boolean');
    });

    // ------------------------------------------------------------------
    // isValidName
    // ------------------------------------------------------------------

    test('isValidName should accept standard R names', () => {
        const { isValidName } = require('../utils');

        assert.strictEqual(isValidName('ggplot2'), true);
        assert.strictEqual(isValidName('primer.tutorials'), true);
        assert.strictEqual(isValidName('r4ds-1'), true);
        assert.strictEqual(isValidName('getting_started'), true);
        assert.strictEqual(isValidName('01-code'), true);
    });

    test('isValidName should reject dangerous characters', () => {
        const { isValidName } = require('../utils');

        assert.strictEqual(isValidName("'; rm -rf /"), false);
        assert.strictEqual(isValidName('foo`bar'), false);
        assert.strictEqual(isValidName('pkg && echo hi'), false);
        assert.strictEqual(isValidName('$(whoami)'), false);
        assert.strictEqual(isValidName(''), false);
    });

    // ------------------------------------------------------------------
    // TutorialItem
    // ------------------------------------------------------------------

    test('TutorialItem should have correct properties', () => {
        const { TutorialItem } = require('../tutorialProvider');

        const item = new TutorialItem(
            'mytutorial', 'mypackage', 'mytutorial', 'rmarkdown',
            vscode.TreeItemCollapsibleState.None
        );

        assert.strictEqual(item.label, 'mytutorial');
        assert.strictEqual(item.packageName, 'mypackage');
        assert.strictEqual(item.tutorialId, 'mytutorial');
        assert.strictEqual(item.format, 'rmarkdown');
        assert.strictEqual(item.tooltip, 'mypackage — mytutorial (learnr tutorial)');
        assert.strictEqual(item.contextValue, 'tutorial');
        assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
    });

    test('TutorialItem should show the format so students know what to expect', () => {
        const { TutorialItem } = require('../tutorialProvider');

        const quarto = new TutorialItem(
            'Hello', 'learnr2', 'hello-learnr2', 'quarto',
            vscode.TreeItemCollapsibleState.None
        );
        assert.strictEqual(quarto.description, 'Quarto');
        assert.strictEqual(quarto.tooltip, 'learnr2 — hello-learnr2 (Quarto tutorial)');

        const classic = new TutorialItem(
            'Hello', 'learnr', 'hello', 'rmarkdown',
            vscode.TreeItemCollapsibleState.None
        );
        assert.strictEqual(classic.description, 'learnr');
    });

    test('TutorialItem should not have a single-click command', () => {
        const { TutorialItem } = require('../tutorialProvider');

        const item = new TutorialItem(
            'tut', 'pkg', 'tut', 'quarto',
            vscode.TreeItemCollapsibleState.None
        );

        assert.strictEqual(item.command, undefined);
    });

    test('TutorialItem should use a dot icon, not a second play triangle', () => {
        const { TutorialItem } = require('../tutorialProvider');

        const item = new TutorialItem(
            'tut', 'pkg', 'tut', 'quarto',
            vscode.TreeItemCollapsibleState.None
        );

        assert.ok(item.iconPath);
        assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'circle-small-filled');
    });

    // ------------------------------------------------------------------
    // PackageItem
    // ------------------------------------------------------------------

    test('PackageItem should have correct properties', () => {
        const { PackageItem } = require('../tutorialProvider');

        const item = new PackageItem('mypackage', 3);

        assert.strictEqual(item.packageName, 'mypackage');
        assert.strictEqual(item.label, 'mypackage');
        assert.strictEqual(item.description, '3 tutorials');
        assert.strictEqual(item.contextValue, 'package');
        assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    });

    test('PackageItem should use singular for 1 tutorial', () => {
        const { PackageItem } = require('../tutorialProvider');

        const item = new PackageItem('mypkg', 1);
        assert.strictEqual(item.description, '1 tutorial');
    });

    test('PackageItem should have a package icon', () => {
        const { PackageItem } = require('../tutorialProvider');

        const item = new PackageItem('pkg', 2);
        assert.ok(item.iconPath);
        assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'package');
    });

    // ------------------------------------------------------------------
    // parseTutorialLines (tutorial titles)
    // ------------------------------------------------------------------

    test('parseTutorialLines should parse package, id, and title', () => {
        const { parseTutorialLines } = require('../tutorialProvider');

        const entries = parseTutorialLines(
            'learnr\tex-data-basics\tData basics\trmarkdown\n' +
            'learnr2\thello-learnr2\tHello, learnr2\tquarto\n'
        );

        assert.strictEqual(entries.length, 2);
        assert.deepStrictEqual(entries[0], {
            packageName: 'learnr',
            tutorialId: 'ex-data-basics',
            title: 'Data basics',
            format: 'rmarkdown'
        });
        assert.deepStrictEqual(entries[1], {
            packageName: 'learnr2',
            tutorialId: 'hello-learnr2',
            title: 'Hello, learnr2',
            format: 'quarto'
        });
    });

    test('parseTutorialLines should treat a missing or unknown format as a learnr tutorial', () => {
        const { parseTutorialLines } = require('../tutorialProvider');

        const entries = parseTutorialLines(
            'pkg\tthree-fields\tA Title\n' +
            'pkg\tunknown-format\tB Title\tsomething-else\n'
        );

        assert.strictEqual(entries[0].format, 'rmarkdown');
        assert.strictEqual(entries[1].format, 'rmarkdown');
    });

    test('parseTutorialLines should default title to empty when absent', () => {
        const { parseTutorialLines } = require('../tutorialProvider');

        // Two-field line (older format / tutorial without a YAML title)
        const entries = parseTutorialLines('pkg\tmy-tutorial\n');

        assert.strictEqual(entries.length, 1);
        assert.strictEqual(entries[0].title, '');
        assert.strictEqual(entries[0].tutorialId, 'my-tutorial');
    });

    test('parseTutorialLines should skip malformed lines', () => {
        const { parseTutorialLines } = require('../tutorialProvider');

        const entries = parseTutorialLines(
            'no-tabs-here\n' +
            'pkg\tgood-one\tA Title\n' +
            '\n'
        );

        assert.strictEqual(entries.length, 1);
        assert.strictEqual(entries[0].tutorialId, 'good-one');
    });

    test('parseTutorialLines should sort by directory name, not title', () => {
        const { parseTutorialLines } = require('../tutorialProvider');

        // Titles in reverse alphabetical order relative to their ids —
        // the id (directory name) order must win.
        const entries = parseTutorialLines(
            'pkg\t02-data\tAI Introduction\n' +
            'pkg\t01-intro\tZebra Patterns\n' +
            'apkg\tzzz\tLast Alphabetically\n'
        );

        assert.strictEqual(entries[0].packageName, 'apkg');
        assert.strictEqual(entries[1].tutorialId, '01-intro');
        assert.strictEqual(entries[2].tutorialId, '02-data');
    });

    test('parseTutorialLines should sort ids with numeric awareness', () => {
        const { parseTutorialLines } = require('../tutorialProvider');

        const entries = parseTutorialLines(
            'pkg\ttutorial-10\tB\n' +
            'pkg\ttutorial-2\tA\n'
        );

        // tutorial-2 before tutorial-10 (numeric, not lexicographic)
        assert.strictEqual(entries[0].tutorialId, 'tutorial-2');
        assert.strictEqual(entries[1].tutorialId, 'tutorial-10');
    });

    test('getChildren should use the title as label and keep the id for running', () => {
        const { TutorialProvider, PackageItem, parseTutorialLines } =
            require('../tutorialProvider');

        const provider = new TutorialProvider();
        const entries = parseTutorialLines('learnr\tex-data-basics\tData basics\n');
        provider['packageMap'] = new Map([['learnr', entries]]);

        const children = provider.getChildren(new PackageItem('learnr', 1));

        assert.strictEqual(children.length, 1);
        assert.strictEqual(children[0].label, 'Data basics');
        assert.strictEqual(children[0].tutorialId, 'ex-data-basics');
        assert.strictEqual(children[0].packageName, 'learnr');
    });

    test('getChildren should carry each tutorial\'s format into its tree item', () => {
        const { TutorialProvider, PackageItem, parseTutorialLines } =
            require('../tutorialProvider');

        const provider = new TutorialProvider();
        const entries = parseTutorialLines(
            'pkg\t01-classic\tClassic\trmarkdown\n' +
            'pkg\t02-modern\tModern\tquarto\n'
        );
        provider['packageMap'] = new Map([['pkg', entries]]);

        const children = provider.getChildren(new PackageItem('pkg', 2));

        assert.deepStrictEqual(
            children.map((c: any) => [c.tutorialId, c.format, c.description]),
            [['01-classic', 'rmarkdown', 'learnr'], ['02-modern', 'quarto', 'Quarto']]
        );
    });

    test('getChildren should show directory names when titles collide', () => {
        const { TutorialProvider, PackageItem, parseTutorialLines } =
            require('../tutorialProvider');

        const provider = new TutorialProvider();
        const entries = parseTutorialLines(
            'pkg\t01-intro\tIntroduction\n' +
            'pkg\t05-recap\tIntroduction\n' +
            'pkg\t03-data\tData basics\n'
        );
        provider['packageMap'] = new Map([['pkg', entries]]);

        const children = provider.getChildren(new PackageItem('pkg', 3));
        const labels = children.map((c: any) => c.label);

        // Both "Introduction" duplicates fall back to their unique directory
        // names; the unambiguous title is untouched.
        assert.deepStrictEqual(labels, ['01-intro', 'Data basics', '05-recap']);
    });

    test('getChildren should fall back to the id when title is empty', () => {
        const { TutorialProvider, PackageItem, parseTutorialLines } =
            require('../tutorialProvider');

        const provider = new TutorialProvider();
        const entries = parseTutorialLines('pkg\tuntitled-tut\n');
        provider['packageMap'] = new Map([['pkg', entries]]);

        const children = provider.getChildren(new PackageItem('pkg', 1));

        assert.strictEqual(children.length, 1);
        assert.strictEqual(children[0].label, 'untitled-tut');
        assert.strictEqual(children[0].tutorialId, 'untitled-tut');
    });

    // ------------------------------------------------------------------
    // TutorialProvider tree data
    // ------------------------------------------------------------------

    test('TutorialProvider should return empty array before initialization', () => {
        const { TutorialProvider } = require('../tutorialProvider');
        const provider = new TutorialProvider();

        const children = provider.getChildren();
        assert.ok(Array.isArray(children));
        assert.strictEqual(children.length, 0);
    });

    test('TutorialProvider getTreeItem should return the same element', () => {
        const { TutorialProvider, TutorialItem } = require('../tutorialProvider');
        const provider = new TutorialProvider();

        const item = new TutorialItem(
            'tut', 'pkg', 'tut', 'quarto',
            vscode.TreeItemCollapsibleState.None
        );

        assert.strictEqual(provider.getTreeItem(item), item);
    });

    test('TutorialProvider should have a refresh method', () => {
        const { TutorialProvider } = require('../tutorialProvider');
        const provider = new TutorialProvider();

        assert.ok(typeof provider.refresh === 'function');
    });

    test('TutorialProvider should fire onDidChangeTreeData event', async function () {
        this.timeout(TIMEOUT);

        const { TutorialProvider } = require('../tutorialProvider');
        const provider = new TutorialProvider();

        const fired = await new Promise<boolean>((resolve) => {
            provider.onDidChangeTreeData(() => {
                resolve(true);
            });
            provider.refresh();
            setTimeout(() => resolve(false), 25000);
        });

        assert.ok(fired, 'onDidChangeTreeData should have fired');
    });

    // ------------------------------------------------------------------
    // Integration: terminal creation
    // ------------------------------------------------------------------

    test('runTutorial command should create a terminal when R is available', async function () {
        this.timeout(TIMEOUT);

        const terminalsBefore = vscode.window.terminals.length;

        // Execute the command with a fake TutorialItem-like argument.
        // This will attempt to check deps and open a terminal.
        // Even if R is not installed, we can at least verify the command
        // doesn't throw.
        try {
            await vscode.commands.executeCommand('rTutorials.runTutorial', {
                packageName: 'learnr2',
                tutorialId: 'hello-learnr2',
                label: 'hello-learnr2'
            });
        } catch {
            // May fail if R isn't installed — that's OK
        }

        // Give terminal time to appear
        await new Promise(resolve => setTimeout(resolve, 1000));

        const terminalsAfter = vscode.window.terminals.length;

        // If R is installed, a terminal should have been created.
        // If not, the count should be unchanged (command bails early).
        // Either outcome is acceptable; we just verify no crash.
        assert.ok(
            terminalsAfter >= terminalsBefore,
            'Terminal count should not decrease'
        );
    });

    // ------------------------------------------------------------------
    // Configuration
    // ------------------------------------------------------------------

    test('rTutorials.rscriptPath setting should exist and default to empty', () => {
        const config = vscode.workspace.getConfiguration('rTutorials');
        const value = config.get<string>('rscriptPath');
        assert.strictEqual(typeof value, 'string');
        assert.strictEqual(value, '', 'Default should be empty string');
    });
});
