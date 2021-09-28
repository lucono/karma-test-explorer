<a href="https://github.com/lucono/karma-test-explorer/actions/workflows/node.js.yml"><img align="right" src="https://github.com/lucono/karma-test-explorer/actions/workflows/node.js.yml/badge.svg"></a>

# Karma Test Explorer for Visual Studio Code - (Preview)

This extension lets you run your Karma tests in Visual Studio Code using the [Test Explorer UI](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer). It supports Angular and non-Angular projects, as well as the Jasmine and Mocha test frameworks. It is based on the [Angular/Karma Test Explorer](https://github.com/Raagh/angular-karma_test-explorer) extension, with various significant enhancements that are outlined [here](#key-enhancements).

![Karma Test Explorer screenshot](img/extension-screenshot.png)

---
__Important__ - _This extension is still in preview. For any problems or questions, please [open an issue](https://github.com/lucono/karma-test-explorer/issues/new)._

---

## Contents

- [Features](#features)
- [Getting Started](#getting-started)
- [Project Types](#project-types)
- [Test Frameworks](#test-frameworks)
- [Configuration](#configuration)
- [Specifying Test Files](#specifying-test-files)
- [Specifying a Test Framework](#specifying-a-test-framework)
- [Testing in a Development Container](#testing-in-a-development-container)
- [Output Panels](#output-panels)
- [Why this Extension](#why-this-extension)
- [Key Enhancements](#key-enhancements)
- [Known Issues and Limitations](#known-issues-and-limitations)
- [Contributing](#contributing)
- [Acknowledgement](#acknowledgement)
- [See Also](#see-also)

## Features

### Core Features

- Angular and non-Angular JS project support
- Jasmine and Mocha test framework support
- Karma version 6 support
- Support for [Dev Containers](https://code.visualstudio.com/docs/remote/containers)
- Watch mode support with auto-update of pass / fail status of tests as they change
- Group and run tests by folder or by test suite
- Specify or override environment variables for Karma
- Run your tests in VS Code using any custom launcher in your Karma config file
- Auto-reload Karma when karma config or other files change
- Automatic port management chooses available ports for running karma and test debugging
- Support for using a custom Karma executable or script (enables greater automation and integration with other processes and workflows)
- Config option to easily switch Karma server to debug logging

### UI Features

- Shows your Karma tests in a visual test explorer in VS Code
- Adds code lenses to your test files to easily run individual tests or suites
- Adds gutter decorations to your test files that show the status of each test
- Adds line decorations to your test files that show the failure message at the point of each test failure

<div align="right"><a href="#contents">Back to Contents</a></div>

## Getting Started

- Install the [extension](https://marketplace.visualstudio.com/items?itemName=lucono.karma-test-explorer)
- Specify your project's [test files](#specifying-test-files) and [test framework](#specifying-a-test-framework) settings
- Specify additional settings if [using a Dev Container](#testing-in-a-development-container)
- Open and use the Test View, or the code lenses in your test files, to run and debug your tests
- Use the various other [extension options](#configuration) to further customize it to the needs of your project and team

<div align="right"><a href="#contents">Back to Contents</a></div>

## Project Types

### Angular Projects

By default, any project with an `angular.json` or `.angular-cli.json` file in the project root is loaded as an Angular project. Use the `karmaTestExplorer.defaultAngularProjectName` setting to specify which configured Angular project should be loaded for testing. Otherwise, the project specified as default in the `angular.json` config will be chosen.

### Non-Angular Projects
Projects without an `angular.json` or `.angular-cli.json` file in the project root are treated as plain Karma projects. Use the various [extension options](#configuration) where necessary to customize Karma Test Explorer's behavior to the specific needs of your project and team.

<div align="right"><a href="#contents">Back to Contents</a></div>

## Test Frameworks

### Jasmine

Jasmine is the test framework assumed by default for all projects, but you can change this with the `karmaTestExplorer.testFramework` extension setting if your project uses Mocha instead.

### Mocha

Use the `karmaTestExplorer.testFramework` config option to specify which Mocha testing interface style (BDD or TDD) is used by your tests. Also note that continuous testing with the watch mode is currently not supported for the Mocha test framework.

<div align="right"><a href="#contents">Back to Contents</a></div>

## Configuration

Though this extension comes with many configuration options that make it flexible to adapt to a wide range of project setups and testing workflows, you may not need to set any of the options as the defaults are designed to work for most projects out of the box. If required however, customizing some of the options to the specific needs of your project may help you get even more out of it for your project and team.

Property                                       | Description
-----------------------------------------------|---------------------------------------------------------------
`karmaTestExplorer.projectRootPath` | The working directory where the project is located (relative to the root folder)
`karmaTestExplorer.defaultAngularProjectName` | Only applies to Angular projects. This is the default Angular project to be loaded for testing. If not specified, the default project specified in `angular.json` is loaded instead
`karmaTestExplorer.testFramework` | The test framework used by the project
`karmaTestExplorer.karmaConfFilePath` | The path where the `karma.conf.js` file is located (relative to `projectRootPath`)
`karmaTestExplorer.testGrouping` | How tests should be grouped in the Test view sidebar
`karmaTestExplorer.flattenSingleChildFolders` | Flattens paths consisting of single child folders when using folder-based test grouping
`karmaTestExplorer.karmaPort` | The port to be used for the Karma server in VS Code
`karmaTestExplorer.browser` | The browser that will be launched by Karma for testing. This can also include any valid custom launcher defined in the Karma config file. This takes precedence over the `customLauncher` setting
`karmaTestExplorer.customLauncher` | Specify the karma custom launcher configuration for launching the test browser, similar to a custom launcher entry in a karma config file
`karmaTestExplorer.autoWatchEnabled` | Enables automatic re-run of tests when the files change
`karmaTestExplorer.autoWatchBatchDelay` | The delay in milliseconds when autoWatch is enabled for batching multiple file changes into a single rerun. This is the same as (and overrides) Karma config's `autoWatchBatchDelay` option
`karmaTestExplorer.env` | Additional environment variables to be set when running the tests. These override the values of the same variables if also provided through the `envFile` setting
`karmaTestExplorer.envFile` | Path to a dotenv file containing environment variables to be set when running the tests
`karmaTestExplorer.karmaProcessExecutable` | The path to a custom Karma executable or command for launching Karma
`karmaTestExplorer.testsBasePath` | The base folder containing the test files (relative to `projectRootPath`)
`karmaTestExplorer.testFiles` | The path glob patterns identifying the test files (relative to `projectRootPath`)
`karmaTestExplorer.excludeFiles` | The path glob patterns identifying files to be excluded from `testFiles` (relative to `projectRootPath`)
`karmaTestExplorer.reloadOnKarmaConfigChange` | Enables reloading of Karma on changes to the Karma configuration file
`karmaTestExplorer.reloadOnChangedFiles` | The files which when modified will trigger a Karma reload
`karmaTestExplorer.karmaReadyTimeout` | The duration in milliseconds after which the extension will stop listening and give up if Karma is not started, connected to the extension, and ready for testing
`karmaTestExplorer.defaultSocketConnectionPort` | This is the port that will be used to connect Karma with the test explorer. When not specified, Karma Test Explorer will automatically use the first available port equal to, or higher than, 9999 
`karmaTestExplorer.debuggerConfig` | The debugger configuration to be used in debugging the Karma tests in VS Code. This is similar to a VS Code launch configuration entry in the `.vscode/launch.json` file
`karmaTestExplorer.containerModeEnabled` | Enables additional support for easier testing in a container
`karmaTestExplorer.logLevel` | Sets the level of logging detail produced in the output panel of the extension. More detailed levels such as the `debug` level can be helpful when troubleshooting issues with running Karma or the extension
`karmaTestExplorer.karmaLogLevel` | Sets the level of logging detail for the Karma server in its output channel, which can be helpful when troubleshooting issues with running Karma or the extension

<div align="right"><a href="#contents">Back to Contents</a></div>

## Specifying Test Files
By default, test files are detected anywhere under the project root directory (excluding `node_modules` directories). However, by explicitly specifying the location of your test files via the `karmaTestExplorer.testFiles` setting, you can reduce the amount of file scanning that's required to find the tests by limiting it to only the directories and files that actually contain the tests, which can significantly speed up discovery of the tests and improve the overall performance of your testing with the Karma Test Explorer.

The default detection behavior for tests looks in all files with filenames that:

- End with `test` or `spec` or `unit`, preceded with a dot (`.`) or a hyphen (`-`) or an underscore (`_`), and
- Have a `.js` or `.ts` extension

For example, the following files would all be detected as test files by default, anywhere under the project root directory tree (except for the `node_modules` directory):

- `utils.spec.ts`
- `utils.spec.js`
- `utils.test.js`
- `utils-spec.ts`
- `utils_test.js`
- `utils.unit.ts`

However, you can change this to the specific name pattern and paths of your test files by using the `karmaTestExplorer.testFiles` extension setting, which accepts an array of file glob patterns that identify the locations of your test files.

For example:

```json
{
  "karmaTestExplorer.testFiles": [
    "src/test/**/test-*.js"
  ]
}
```

<div align="right"><a href="#contents">Back to Contents</a></div>

## Specifying a Test Framework

Karma Test Explorer auto-determines Angular vs. non-Angular (or plain Karma) projects based on the presence of the `angular.json` or `.angular-cli.json` file in the project root directory. When either of these files is present, Karma Test Explorer will treat the project as an Angular project, and when they are not, the project is treated as a plain / non-Angular Karma project.

However, for determining whether your project uses the Jasmine or Mocha test framework, Karma Test Explorer uses the `karmaTestExplorer.testFramework` config option, whicn can have one of the following values:

Value | Description
------|------------
`jasmine` | The Jasmine test framework. This is the default when `karmaTestExplorer.testFramework` is not specified
`mocha−bdd` | The Mocha test framework with the BDD-style interface which uses `describe` to define test suites and `it` to define test cases
`mocha−tdd` | The Mocha test framework with the TDD-style interface which uses `suite` to define test suites and `test` to define test cases

Because whether the project is Angular or non-Angular is auto-detected, and Jasmine is the default test framework when the `karmaTestExplorer.testFramework` option is not set, the only time it usually is required to provide or adjust this setting is when your project uses the Mocha test framework, in which case you should provide the appropriate Mocha value for the BDD or TDD style DSL used by your project to ensure that your tests will be successfully discovered.

<div align="right"><a href="#contents">Back to Contents</a></div>

## Testing in a Development Container

With VS Code's Development Container feature, you can develop and run your project's Karma tests inside a container, using browsers installed in the container. However, launching Chrome and other Chromium browsers in a container environment may often require additional browser flags and other adjustments. Therefore, to fully support DevContainer-based setups and workflows, Karma Test Explorer provides the `karmaTestExplorer.containerModeEnabled` setting which, when enabled, makes all necessary customizations required for container-based development and testing.

### Using `karmaTestExplorer.containerModeEnabled`

When the `karmaTestExplorer.containerModeEnabled` config option is `true`, Karma Test Explorer will make adjustments specifically to support easier testing in a container environment. This includes internally applying the `--no-sandbox` flag when launching the default Chrome browser, unless either of the `karmaTestExplorer.browser` or `karmaTestExplorer.customLauncher` config options are also specified, in which case it is up to the user to ensure that the provided browser launcher is properly setup to successfully launch the associated browser in the container environment.

### Other Options for Testing in a Dev Container

If for any reason, using the `karmaTestExplorer.containerModeEnabled` setting is not a viable option for your project (for example, if you're using a different browser and need to apply a different set of browser flags, or if the `--no-sandbox` browser flag which is internally added by the `containerModeEnabled` option would break or conflict with other functionality or setup in your project's container environment), then you might still be able to leverage Karma Test Explorer's several other flexible options to successfully achieve a working VS Code test setup for your project within your container environment, depending on what's viable and desirable for your project and team.

#### Option 1 - Using `karmaTestExplorer.customLauncher`

With the `karmaTestExplorer.customLauncher` config option, you can provide a custom launcher definition directly in your VS Code settings that Karma Test Explorer will use for running your project's Karma tests. This makes it possible to provide a customized launcher for testing your project in VS Code without needing to modify your project's Karma config file to define a new launcher or adapt an existing one for running your project's tests.

In your VS Code project's settings file (`.vscode/settings.json`):

```json
{
  "karmaTestExplorer.customLauncher": {
    "base": "ChromeHeadless",
    "flags": [
      "--flag-required-in-my-container-environment",
      "--another-required-flag",
      "--yet-another-one"
    ]
  }
}
```

#### Option 2 - Using `karmaTestExplorer.browser`

With the `karmaTestExplorer.browser` config option, you can specify the name of any custom launcher definition that would normally be available to Karma for test execution in your project, including any that are defined in the `customLaunchers` property of your project's Karma config file. This makes it possible and easy to reuse any custom launcher defined in your Karma config file that's already properly configured to work in your project's container environment.

In your project's `karma.conf.js`:

```js
customLaunchers: {
  MyContainerBrowserThatWorks: {
    base: 'FirefoxHeadless',
    flags: [ '--launcher-flag-that-works' ]
  }
}
```

In your VS Code project's settings file (`.vscode/settings.json`):

```json
{
  "karmaTestExplorer.browser": "MyContainerBrowserThatWorks"
}
```

#### Option 3 - Using `karmaTestExplorer.env` or `karmaTestExplorer.envFile`

For more elaborate or highly custom project or environment setups that require a more intricate process for launching the test browser, the `karmaTestExplorer.env` and `karmaTestExplorer.envFile` config options make it possible to specify environment variables - such as `CHROME_PATH` and `CHROME_BIN` - which can point the Karma launcher to a custom script that can be used to provide any required prerequisites and perform whatever specific steps are required to launch the browser process or environment needed for running the tests.

<div align="right"><a href="#contents">Back to Contents</a></div>

## Output Panels

Name | Description
-----|-------------
Karma&nbsp;Test&nbsp;Explorer | This output panel shows the logs of the Karma Test Explorer extension. The `karmaTestExplorer.logLevel` setting can be used to set the desired level of extension logging detail, with `trace` having the most detailed and verbose logging.
Karma&nbsp;Server | This output panel shows the Karma server log. The `karmaTestExplorer.karmaLogLevel` can be used to set the level of logging detail desired from the Karma server.

<div align="right"><a href="#contents">Back to Contents</a></div>

## Why this Extension

The `Karma Test Explorer` extension was initially created out of [need for additional features](https://github.com/Raagh/angular-karma_test-explorer/issues?q=is%3Aissue+author%3Alucono) from the [Angular/Karma Test Explorer](https://github.com/Raagh/angular-karma_test-explorer) extension at a time when that project seemed not to be accepting contributions anymore, and is a major rewrite aimed at facilitating various significant enhancements and new features.

This extension's core focus is on better and robust support for:

- Large projects with thousands of tests
- Remote development sceanarios with [Dev Containers](https://code.visualstudio.com/docs/remote/containers)
- Flexibility to support a wide range of testing scenarios and workflows
- Reliability, usability, and team productivity

<div align="right"><a href="#contents">Back to Contents</a></div>

## Key Enhancements

- Karma version 6 support
- Mocha test framework support
- Support for [Dev Containers](https://code.visualstudio.com/docs/remote/containers)
- Support for Karma watch mode with continuous auto-testing and visual update of pass / fail status of changing tests within the IDE (not yet supported for Mocha test framework)
- Support for grouping tests by folder and running entire folder sub-trees of tests as a group
- Stats for passed, failed, skipped, and total test count, as well as test execution time for tests in the Test view sidebar
- Environment variable support provided directly in the extension settings or via a `.env` file
- Support for using any custom launcher definition available in the Karma config for running tests, or defining a new one directly in the extension settings
- Support for automatically reloading Karma on changes to the Karma config file
- Support for using a different Karma port than the one in the Karma config for testing in VS Code
- Better detection of file and line location of tests, and more reliable positioning of code lenses
- Better logging and error handling for understanding and troubleshooting Karma testing issues
- More resilient port management with dynamic allocation of all ports to prevent port conflicts
- Dedicated `Karma Server` output channel for viewing the Karma server log within VS Code

<div align="right"><a href="#contents">Back to Contents</a></div>

## Known Issues and Limitations

- Watch mode only works in the Test Explorer UI and doesn't currently work if the `testExplorer.useNativeTesting` config setting is used to disable the Test Explorer UI in favor of VS Code's native testing UI
- Test descriptions that are computed are currently not supported. Test descriptions must be plain string literals in order to be available in the Test view sidebar. For example:
  ```ts
  // Supported
  it('supports plain literal test descriptions', ...
  it(`supports plain literal test descriptions`, ...

  // Not supported
  it('does not support computed ' + someValue + ' test descriptions', ...
  it(`does not support computed ${someValue} test descriptions`, ...
  ```

<div align="right"><a href="#contents">Back to Contents</a></div>

## Contributing

### Recommended Areas of Focus

Contributions to the Karma Test Explorer are welcome, particularly in the core areas of focus mentioned in the [Why this Extension](#why-this-extension) section. Other particular areas, among others, include:

- Migrating to the native VS Code test API
- Enhancing the level of Angular and Mocha support
- Adding support for code coverage
- Increasing test coverage
- Any general updates that make contributing easier

### Setup and Development

The project is also pre-configured for development in a [Dev Container](https://code.visualstudio.com/docs/remote/containers), making it quick and easy to get setup and contributing to the project.

- Fork and clone the [project repo](https://github.com/lucono/karma-test-explorer) and open it in VS Code
- Select the option to Reopen in Container, which will build the container if not already previously done, and install all project dependencices
- Create a branch with a short descriptive name for the new or existing bug or feature for which you wish to contribute, naming feature branches with a _feature_ prefix (eg. `feature/my-feature-description`) and bugfixes with a _bugfix_ prefix (eg. `bugfix/bug-description`)
- Code your contributions in the branch, ensuring to include:
  - Unit tests that adequately cover, at a minimum, the functionality for the feature or bugfix being contributed
  - Any new documentation and updates to existing documentation related to the feature or bugfix being contributed
- Create a pull request with your proposed contribution, ensuring that it is linked to the GitHub issue for the related bug or feature
- In the pull request description, include a summary of the changes in the pull request
- Ensure the pull request passes the CI build and all other CI checks

### Building and Testing the Code

For linting and building the code, and running unit tests, you can use the following:

  Command | Action
  --------|-------
  <code>npm&nbsp;run&nbsp;build</code> | Build the project
  <code>npm&nbsp;run&nbsp;test</code>  | Run the unit tests for the project. Jest is used for unit testing
  <code>npm&nbsp;run&nbsp;lint</code>  | Run linting on the project files. ESLint is used for linting
  <code>npm&nbsp;run&nbsp;validate</code> | Validate your changes before creating a pull request

<div align="right"><a href="#contents">Back to Contents</a></div>

---
## Acknowledgement

Special thanks to the [author](https://github.com/Raagh) and contributors of the [Angular/Karma Test Explorer](https://github.com/Raagh/angular-karma_test-explorer) extension on which Karma Test Explorer is based.

---
## See Also

- [Changelog](./CHANGELOG.md#changelog)
