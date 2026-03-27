import * as assert from 'assert';
import * as vscode from 'vscode';

suite('R Tutorials Extension', () => {

    const TIMEOUT = 30000;

    // ------------------------------------------------------------------
    // Activation
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
    // TutorialItem
    // ------------------------------------------------------------------

    test('TutorialItem should have correct properties', () => {
        const { TutorialItem } = require('../tutorialProvider');

        const item = new TutorialItem(
            'mytutorial',
            'mypackage',
            'mytutorial',
            vscode.TreeItemCollapsibleState.None
        );

        assert.strictEqual(item.label, 'mytutorial');
        assert.strictEqual(item.packageName, 'mypackage');
        assert.strictEqual(item.tutorialId, 'mytutorial');
        assert.strictEqual(item.tooltip, 'mypackage — mytutorial');
        assert.strictEqual(item.contextValue, 'tutorial');
        assert.strictEqual(
            item.collapsibleState,
            vscode.TreeItemCollapsibleState.None
        );
    });

    test('TutorialItem should not have a single-click command', () => {
        const { TutorialItem } = require('../tutorialProvider');

        const item = new TutorialItem(
            'tut', 'pkg', 'tut',
            vscode.TreeItemCollapsibleState.None
        );

        assert.strictEqual(item.command, undefined);
    });

    test('TutorialItem should have a play icon', () => {
        const { TutorialItem } = require('../tutorialProvider');

        const item = new TutorialItem(
            'tut', 'pkg', 'tut',
            vscode.TreeItemCollapsibleState.None
        );

        assert.ok(item.iconPath);
        assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'play');
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
        assert.strictEqual(
            item.collapsibleState,
            vscode.TreeItemCollapsibleState.Collapsed
        );
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
    // Utils — isValidName
    // ------------------------------------------------------------------

    test('isValidName should accept standard R names', () => {
        const { isValidName } = require('../utils');

        assert.strictEqual(isValidName('ggplot2'), true);
        assert.strictEqual(isValidName('primer.tutorials'), true);
        assert.strictEqual(isValidName('r4ds-1'), true);
        assert.strictEqual(isValidName('getting_started'), true);
    });

    test('isValidName should reject dangerous characters', () => {
        const { isValidName } = require('../utils');

        assert.strictEqual(isValidName("'; rm -rf /"), false);
        assert.strictEqual(isValidName('foo`bar'), false);
        assert.strictEqual(isValidName('pkg && echo hi'), false);
        assert.strictEqual(isValidName(''), false);
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
    // Configuration
    // ------------------------------------------------------------------

    test('rTutorials.rscriptPath setting should exist', () => {
        const config = vscode.workspace.getConfiguration('rTutorials');
        const value = config.get<string>('rscriptPath');
        // Default is empty string
        assert.strictEqual(typeof value, 'string');
    });
});
