# R Tutorials for VS Code

Browse and run R package tutorials (learnr) directly from the VS Code sidebar.

## Features

- Activity Bar icon for quick access to all installed R tutorials
- Lists tutorials from all installed R packages that use learnr
- Click to run any tutorial directly
- Automatically detects missing dependencies and offers to install them
- Refresh button to update the tutorial list after installing new packages

## Requirements

- [R](https://cran.r-project.org/) installed and available in PATH
- The [learnr](https://rstudio.github.io/learnr/) R package

## Usage

1. Click the R Tutorials icon in the Activity Bar
2. Browse the list of available tutorials
3. Use **⌥⌘F** (Mac) or **Ctrl+Alt+F** (Windows/Linux) to filter
4. Click any tutorial to run it

## Installation

This extension is not yet published to the VS Code Marketplace. To install from source:
```bash
git clone https://github.com/PPBDS/vscode-r-tutorials.git
cd vscode-r-tutorials
npm install
npm run compile
```

Then open the folder in VS Code and press F5 to test.