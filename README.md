# R Tutorials for VS Code

Browse and run R package tutorials directly from the VS Code sidebar.

## Features

* Activity Bar icon for quick access to all installed R tutorials
* Shows both kinds of tutorial: [learnr2](https://ppbds.github.io/learnr2/)
  Quarto tutorials, which run in the browser via WebR, and classic
  [learnr](https://rstudio.github.io/learnr/) tutorials, which run as a
  Shiny app.
* Tutorials grouped by package for easy browsing
* Click the play button to run any tutorial directly
* Automatically detects missing dependencies and offers to install them
* Refresh button to update the tutorial list after installing new packages
* Cross-platform: works on macOS, Linux, and Windows

## Requirements

* [R](https://cran.r-project.org/) installed
* The [learnr2](https://ppbds.github.io/learnr2/) R package. It lists and
  runs both kinds of tutorial. It is not on CRAN, so install it from GitHub:

  ```r
  install.packages("pak")
  pak::pak("PPBDS/learnr2")
  ```

  Packages that bundle classic learnr tutorials already depend on learnr, so
  nothing else needs installing for those.
* The [Quarto](https://quarto.org/docs/get-started/) command line tool, for
  Quarto tutorials. Classic learnr tutorials do not need it.

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
| `rTutorials.closeWelcomeOnStartup` | `false` | Close VS Code's Welcome tab once the window has started, so the editor area starts empty. For managed setups (e.g. a devcontainer, where `workbench.startupEditor` cannot be set because it is application-scoped). |

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
