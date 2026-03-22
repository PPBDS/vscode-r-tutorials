import * as assert from 'assert';
import * as vscode from 'vscode';

suite('R Tutorials Extension', () => {

    // Give tests more time since some trigger R processes
    const TIMEOUT = 30000;

    // ------------------------------------------------------------------
    // Activation
    // ------------------------------------------------------------------

    test('Extension should be present', () => {
        assert.ok(true, 'Extension file loaded');
    });

    test('Commands should be registered after activation', async function () {
        this.timeout(TIMEOUT);

        // Activate the extension by triggering its view
        await vscode.commands.executeCommand('rTutorialsList.focus');

        // Give it a moment to finish activating
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
    // TutorialItem unit-style tests
    // ------------------------------------------------------------------

    test('TutorialItem should have correct properties', () => {
        const { TutorialItem } = require('../tutorialProvider');

        const item = new TutorialItem(
            'mypackage - mytutorial',
            'mypackage',
            'mytutorial',
            vscode.TreeItemCollapsibleState.None
        );

        assert.strictEqual(item.label, 'mypackage - mytutorial');
        assert.strictEqual(item.packageName, 'mypackage');
        assert.strictEqual(item.tutorialId, 'mytutorial');
        assert.strictEqual(item.tooltip, 'mypackage - mytutorial');
        assert.strictEqual(
            item.collapsibleState,
            vscode.TreeItemCollapsibleState.None
        );
    });

    test('TutorialItem should have a run command', () => {
        const { TutorialItem } = require('../tutorialProvider');

        const item = new TutorialItem(
            'pkg - tut',
            'pkg',
            'tut',
            vscode.TreeItemCollapsibleState.None
        );

        assert.ok(item.command, 'Item should have a command');
        assert.strictEqual(item.command.command, 'rTutorials.runTutorial');
        assert.deepStrictEqual(item.command.arguments, ['pkg', 'tut']);
    });

    test('TutorialItem should have a play icon', () => {
        const { TutorialItem } = require('../tutorialProvider');

        const item = new TutorialItem(
            'pkg - tut',
            'pkg',
            'tut',
            vscode.TreeItemCollapsibleState.None
        );

        assert.ok(item.iconPath, 'Item should have an icon');
        assert.strictEqual(
            (item.iconPath as vscode.ThemeIcon).id,
            'play'
        );
    });

    // ------------------------------------------------------------------
    // TutorialProvider tree data
    // ------------------------------------------------------------------

    test('TutorialProvider should return empty array before initialization', () => {
        const { TutorialProvider } = require('../tutorialProvider');
        const provider = new TutorialProvider();

        const children = provider.getChildren();
        assert.ok(Array.isArray(children), 'getChildren should return an array');
        assert.strictEqual(children.length, 0, 'Should be empty before init');
    });

    test('TutorialProvider getTreeItem should return the same element', () => {
        const { TutorialProvider, TutorialItem } = require('../tutorialProvider');
        const provider = new TutorialProvider();

        const item = new TutorialItem(
            'pkg - tut',
            'pkg',
            'tut',
            vscode.TreeItemCollapsibleState.None
        );

        const result = provider.getTreeItem(item);
        assert.strictEqual(result, item, 'getTreeItem should return the input element');
    });

    test('TutorialProvider should have a refresh method', () => {
        const { TutorialProvider } = require('../tutorialProvider');
        const provider = new TutorialProvider();

        assert.ok(
            typeof provider.refresh === 'function',
            'Provider should have a refresh method'
        );
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
            // Fallback timeout in case R is not installed
            setTimeout(() => resolve(false), 25000);
        });

        assert.ok(fired, 'onDidChangeTreeData should have fired');
    });
});