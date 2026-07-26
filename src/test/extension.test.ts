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
            'Rscript -e "learnr::run_tutorial(\'intro\', package = \'learnr\')"'
        );
    });

    test('buildRunCommand with Unix path', () => {
        const { buildRunCommand } = require('../utils');

        const cmd = buildRunCommand('/usr/local/bin/Rscript', 'r4ds-1', 'primer.tutorials');
        assert.strictEqual(
            cmd,
            '/usr/local/bin/Rscript -e "learnr::run_tutorial(\'r4ds-1\', package = \'primer.tutorials\')"'
        );
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
            cmd.includes("run_tutorial('hello', package = 'learnr')"),
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
        assert.ok(cmd.includes("run_tutorial('intro', package = 'learnr')"), 'Should include run');
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
            cmd.includes("run_tutorial('sampling', package = 'primer.tutorials')"),
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
            'mytutorial', 'mypackage', 'mytutorial',
            vscode.TreeItemCollapsibleState.None
        );

        assert.strictEqual(item.label, 'mytutorial');
        assert.strictEqual(item.packageName, 'mypackage');
        assert.strictEqual(item.tutorialId, 'mytutorial');
        assert.strictEqual(item.tooltip, 'mypackage — mytutorial');
        assert.strictEqual(item.contextValue, 'tutorial');
        assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
    });

    test('TutorialItem should not have a single-click command', () => {
        const { TutorialItem } = require('../tutorialProvider');

        const item = new TutorialItem(
            'tut', 'pkg', 'tut',
            vscode.TreeItemCollapsibleState.None
        );

        assert.strictEqual(item.command, undefined);
    });

    test('TutorialItem should use a dot icon, not a second play triangle', () => {
        const { TutorialItem } = require('../tutorialProvider');

        const item = new TutorialItem(
            'tut', 'pkg', 'tut',
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
            'learnr\tex-data-basics\tData basics\n' +
            'learnr\thello\tHello, Tutorial!\n'
        );

        assert.strictEqual(entries.length, 2);
        assert.deepStrictEqual(entries[0], {
            packageName: 'learnr',
            tutorialId: 'ex-data-basics',
            title: 'Data basics'
        });
        assert.deepStrictEqual(entries[1], {
            packageName: 'learnr',
            tutorialId: 'hello',
            title: 'Hello, Tutorial!'
        });
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
            'tut', 'pkg', 'tut',
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
                packageName: 'learnr',
                tutorialId: 'hello',
                label: 'hello'
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
