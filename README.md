# R Tutorials for VS Code

Browse and run R package tutorials directly from the VS Code sidebar.

## Features

* Activity Bar icon for quick access to all installed R tutorials
* Tutorials grouped by package for easy browsing
* Click the play button to run any tutorial directly
* Automatically detects missing dependencies and offers to install them
* Refresh button to update the tutorial list after installing new packages
* Cross-platform: works on macOS, Linux, and Windows

## Requirements

* [R](https://cran.r-project.org/) installed
* The [learnr](https://rstudio.github.io/learnr/) R package

On macOS and Linux, R is usually found automatically via PATH. On Windows,
the extension reads R's install location from the Windows Registry (set during
a default CRAN installation). If auto-detection fails, set the path manually
in settings (see below).

## Usage

1. Click the R Tutorials icon in the Activity Bar
2. Expand a package to see its tutorials
3. Use **⌥⌘F** (Mac) or **Ctrl+Alt+F** (Windows/Linux) to filter
4. Click the arrow to the right of the tutorial name to run it

## Settings

| Setting | Default | Description |
|---|---|---|
| `rTutorials.rscriptPath` | `""` (auto-detect) | Path to the `Rscript` executable. Leave blank to auto-detect. |

Examples:
* macOS: `/usr/local/bin/Rscript`
* Linux: `/usr/bin/Rscript`
* Windows: `C:\Program Files\R\R-4.4.0\bin\x64\Rscript.exe`

## Installation

To install from source:

```
git clone https://github.com/PPBDS/vscode-r-tutorials.git
cd vscode-r-tutorials
npm install
npm run compile
```

Then open the folder in VS Code and press F5 to test.

## License

[MIT](LICENSE)
