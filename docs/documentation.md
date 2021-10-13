# Documentation - Karma Test Explorer

## Contents

- [Getting Started](#getting-started)
- [Project Types](#project-types)
- [Test Frameworks](#test-frameworks)
- [Configuration](#configuration)
- [Specifying Test Files](#specifying-test-files)
- [Specifying a Test Framework](#specifying-a-test-framework)
- [Testing in a Development Container](#testing-in-a-development-container)
- [Output Panels](#output-panels)
- [Known Issues and Limitations](#known-issues-and-limitations)
- [See Also](#see-also)

## Getting Started

### Install Prerequisites

Prerequisite | Description
-------------|------------
Test&nbsp;Browser | Karma Test Explorer requires a browser for running tests, which by default is the Chrome browser, though you can provide a custom launcher which uses a different browser. Whichever browser is used must be installed on the computer or container where VS Code will be running your project's tests
Test&nbsp;Frameworks | The various frameworks required for your project's tests must be installed. This can include for instance, some of Angular, Karma, Jasmine, Mocha, Karma-Jasmine, Karma-Mocha, etc, all of which will usually be defined as Dev dependencies in your project's package.json file, so that simply running `npm install` would ensure they are all installed
Karma&nbsp;Test&nbsp;Explorer | The Karma Test Explorer [extension](https://marketplace.visualstudio.com/items?itemName=lucono.karma-test-explorer) must be installed and enabled in VS Code. If developing and testing your project in a container, then the extension's installation mode in VS Code should be in the remote workspace

### Configure Extension

Description&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | Only&nbsp;Required | Config&nbsp;Setting
-------|---------------|----------------
Specify project root path relative to the workspace folder | If the root path of the project is not the same as the VS Code workspace root folder | `karmaTestExplorer.projectRootPath`
Specify `karma.conf.js` file path relative to the project root folder | If the `karma.conf.js` file has a different filename, or is not located in the project root folder | `karmaTestExplorer.karmaConfFilePath`
Specify project [test files](#specifying-test-files) | Always recommended, for better performance | `karmaTestExplorer.testFiles`
Provide any other relevant [settings](#configuration) | Optional but recommended - use the various other Karma Test Explorer configuration [options](#configuration) to further customize it to the needs of your project and team| [Config Settings](#configuration)

When done updating the settings, select the Karma Test Explorer prompt to __Apply Settings__ and wait a moment while it refreshes. You can also reload VS Code to apply the changes if you don't see the prompt.

<a href="#contents"><img align="right" height="24" src="img/back-to-top.png"></a>

### Run Your Tests

- After Karma Test Explorer is done refreshing with the updated settings, your tests should show up in the Test View, as well as code lenses above each test in the code editor, either of which can be used to run and debug the tests
- Note that Karma Test Explorer will briefly display updates (using available space if any) on the VS Code status bar, showing the current status of the test operations. You can click on the status bar message to display additional options or show the extension log.

## Project Types

### Angular Projects

By default, any project with an `angular.json` or `.angular-cli.json` file in the project root is loaded as an Angular project. Use the `karmaTestExplorer.defaultAngularProjectName` setting to specify which configured Angular project should be loaded for testing. Otherwise, the project specified as default in the `angular.json` config will be chosen.

### Non-Angular Projects
Projects without an `angular.json` or `.angular-cli.json` file in the project root are treated as plain Karma projects. Use the various [extension options](#configuration) where necessary to customize Karma Test Explorer's behavior to the specific needs of your project and team.

<a href="#contents"><img align="right" height="24" src="img/back-to-top.png"></a>

## Test Frameworks

Karma Tesk Explorer supports both the Jasmine and Mocha test frameworks, and is usually able to automatically detect which one is in use by your project, so that it's usually not necessary to manually specify this in the config settings.

### Jasmine

If your project uses the Jasmine test framework and it is not automatically detected by Karma Test Explorer, use the `karmaTestExplorer.testFramework` config option to specify the right framework.

### Mocha

If your project uses the Mocha test framework and it - or the right Mocha interface style - is not automatically detected by Karma Test Explorer, use the `karmaTestExplorer.testFramework` config option to specify which Mocha testing interface style (BDD or TDD) is used by your tests.

---
_Note that watch mode is currently not supported for the Mocha test framework._

---

<a href="#contents"><img align="right" height="24" src="img/back-to-top.png"></a>

## Configuration

Though this extension comes with many configuration options that make it flexible to adapt to a wide range of project setups and testing workflows, you may not need to set any of the options as the defaults are designed to work for most projects out of the box. If required however, customizing some of the options to the specific needs of your project may help you get even more out of it for your project and team.

Setting                                       | Description
-----------------------------------------------|---------------------------------------------------------------
`karmaTestExplorer.projectRootPath` | The working directory where the project is located (relative to the root folder)
`karmaTestExplorer.defaultAngularProjectName` | Only applies to Angular projects. This is the default Angular project to be loaded for testing. If not specified, the default project specified in `angular.json` is loaded instead
`karmaTestExplorer.testFramework` | The test framework used by the project. The framework will be auto-detected if none is specified. Specify the right test framework if it is not correctly auto-detected
`karmaTestExplorer.karmaConfFilePath` | The path where the `karma.conf.js` file is located (relative to `projectRootPath`)
`karmaTestExplorer.testGrouping` | How tests should be grouped in the Test view side bar
`karmaTestExplorer.flattenSingleChildFolders` | Flattens paths consisting of single child folders when using folder-based test grouping
`karmaTestExplorer.karmaPort` | The port to be used for the Karma server in VS Code
`karmaTestExplorer.browser` | The browser that will be launched by Karma for testing. This can also include any valid custom launcher defined in the Karma config file. This takes precedence over the `customLauncher` setting
`karmaTestExplorer.customLauncher` | Specify the karma custom launcher configuration for launching the test browser, similar to a custom launcher entry in a karma config file
`karmaTestExplorer.autoWatchEnabled` | Enables automatic re-run of tests when the files change
`karmaTestExplorer.autoWatchBatchDelay` | The delay in milliseconds when autoWatch is enabled for batching multiple file changes into a single rerun. This is the same as Karma config's `autoWatchBatchDelay` option and overrides it when set
`karmaTestExplorer.env` | Additional environment variables to be set when running the tests. These override the values of the same variables if also provided through the `envFile` setting
`karmaTestExplorer.envFile` | Path to a dotenv file containing environment variables to be set when running the tests
`karmaTestExplorer.karmaProcessCommand` | The command or path to an executable to use for launching Karma. This is useful for using a custom script or different command other than the default
`karmaTestExplorer.angularProcessCommand` | The command or path to an executable to use for launching or running Angular tests. This is useful for using a custom script or different command other than the default
`karmaTestExplorer.testTriggerMethod` | Experimental. Specifies how test runs are triggered by default, either through the Karma CLI or Http interface. You will usually not need to use this setting unless working around specific issues
`karmaTestExplorer.failOnStandardError` | Treats any errors written to stderr as a failure. This can sometimes be useful for uncovering testing issues
`karmaTestExplorer.testsBasePath` | The base folder containing the test files (relative to `projectRootPath`)
`karmaTestExplorer.testFiles` | The path glob patterns identifying the test files (relative to `projectRootPath`)
`karmaTestExplorer.excludeFiles` | The path glob patterns identifying files to be excluded from `testFiles` (relative to `projectRootPath`)
`karmaTestExplorer.reloadOnKarmaConfigChange` | Enables reloading of Karma on changes to the Karma configuration file
`karmaTestExplorer.reloadOnChangedFiles` | The files which when modified will trigger a Karma reload
`karmaTestExplorer.karmaReadyTimeout` | The duration in milliseconds after which the extension will stop listening and give up if Karma is not started, connected to the extension, and ready for testing
`karmaTestExplorer.defaultSocketConnectionPort` | This is the port that will be used to connect Karma with the test explorer. When not specified, Karma Test Explorer will automatically use the first available port equal to, or higher than, 9999 
`karmaTestExplorer.debuggerConfig` | The debugger configuration to be used in debugging the Karma tests in VS Code. This is similar to a VS Code launch configuration entry in the `.vscode/launch.json` file
`karmaTestExplorer.containerMode` | Enables additional support for easier testing when running in a container. Can be either `auto` (the default when not set), `enabled`, or `disabled`
`karmaTestExplorer.logLevel` | Sets the level of logging detail produced in the output panel of the extension. More detailed levels such as the `debug` level can be helpful when troubleshooting issues with running Karma or the extension
`karmaTestExplorer.karmaLogLevel` | Sets the level of logging detail for the Karma server in its output channel, which can be helpful when troubleshooting issues with running Karma or the extension

<a href="#contents"><img align="right" height="24" src="img/back-to-top.png"></a>

## Specifying Test Files

By default, Karma Test Explorer searches for test files in every path under the project root directory (excluding `node_modules` directories). However, by explicitly specifying the location of your test files via the `karmaTestExplorer.testFiles` setting, you can reduce the amount of file scanning that's required to find your tests by limiting it to only the folders and files that actually contain the tests, which can significantly speed up discovery of your tests and improve the overall performance of your testing with the Karma Test Explorer.

### Default Test Discovery

The default test discovery behavior looks for tests in all JavaScript or TypeScript files with a filename that starts or ends with `test` or `spec` or `unit`, delimited from the other part of the filename with a dot (`.`) or a hyphen (`-`) or an underscore (`_`).

For example, the following files would all be detected as test files by default, anywhere under the project root directory tree (except for the `node_modules` directory):

- `utils.spec.ts`
- `utils.spec.js`
- `utils.test.js`
- `utils-spec.ts`
- `utils_test.js`
- `utils.unit.ts`

### Customizing Test Discovery

However, you can change this to the specific name pattern and paths of your test files by using the `karmaTestExplorer.testFiles` extension setting, which accepts an array of file glob patterns that identify the locations of your test files.

For example:

```json
{
  "karmaTestExplorer.testFiles": [
    "src/test/**/test-*.js"
  ]
}
```

<a href="#contents"><img align="right" height="24" src="img/back-to-top.png"></a>

## Specifying a Test Framework

By default, when no test framework is specified (ie, the `karmaTestExplorer.testFramework` config option is not set), Karma Test Explorer will try to auto-detect the test framework that is used by your project by looking at its `karma.conf.js` file. If it detects the Mocha framework, it will by default assume the BDD style for the project. If your project uses Mocha with the TDD style instead, or if your project's test framework is not correctly detected for any other reason, you can explicitly specify the right framework by setting the `karmaTestExplorer.testFramework` config option, whicn can have one of the following values:

Value | Description
------|------------
`jasmine` | The Jasmine test framework
`mocha−bdd` | The Mocha test framework with the BDD-style interface which uses `describe` to define test suites and `it` to define test cases. This is the default assumed when Mocha is auto-detected as the test framework
`mocha−tdd` | The Mocha test framework with the TDD-style interface which uses `suite` to define test suites and `test` to define test cases

Most times however, you will not need to set this config option at all as Karma Test Explorer will be able to automatically detect the right test framework in use by your project. Note also that specifying a framework value that is different from the one actually in use by your project will usually result in your tests not being successfully discovered.

<a href="#contents"><img align="right" height="24" src="img/back-to-top.png"></a>

## Testing in a Development Container

With VS Code's Development Container feature, you can develop and run your project's Karma tests inside a container, using browsers installed in that container. However, launching Chrome and other Chromium browsers in a container environment often requires additional browser flags and other adjustments. Therefore, to fully support DevContainer-based setups and workflows, Karma Test Explorer provides a number of options to help make development and testing smoother and more seamless in those scenarios.

### Using `karmaTestExplorer.containerMode`

By default, Karma Test Explorer will automatically detect whether you are testing in a container environment, in which case it will activate `containerMode` which makes all necessary customizations required for smoother container-based development and testing. You can also manually enable this mode by setting the `karmaTestExplorer.containerMode` config setting to `enabled`. Because its default value when not set is `auto`, it should mostly not be necessary to manually set this option at all, unless in a situation where you are running in a container environment and find that Karma Test Explorer is not able to automatically detect it.

When in container mode, the adjustments made by Karma Test Explorer include internally applying the `--no-sandbox` flag when launching the default Chrome browser, unless either of the `karmaTestExplorer.browser` or `karmaTestExplorer.customLauncher` config options are also specified, in which case it is up to the user to ensure that the provided browser launcher is properly set up to successfully launch the associated browser in the container environment.

### Other Options for Testing in a Dev Container

If for any reason, using the `karmaTestExplorer.containerMode` setting is not a viable option for your project (for example, if you're using a different browser and need to apply a different set of browser flags, or if the `--no-sandbox` browser flag which is internally added by the `containerMode` option would break or conflict with other functionality or setup in your project's container environment), then you might still be able to leverage Karma Test Explorer's several other flexible options to successfully achieve a working VS Code test setup for your project within your container environment, depending on what's viable and desirable for your project and team.

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

<a href="#contents"><img align="right" height="24" src="img/back-to-top.png"></a>

## Output Panels

Name | Description
-----|-------------
Karma&nbsp;Test&nbsp;Explorer | This output panel shows the logs of the Karma Test Explorer extension. The `karmaTestExplorer.logLevel` setting can be used to set the desired level of extension logging detail, with `trace` having the most detailed and verbose logging.
Karma&nbsp;Server | This output panel shows the Karma server log. The `karmaTestExplorer.karmaLogLevel` can be used to set the level of logging detail desired from the Karma server.

<a href="#contents"><img align="right" height="24" src="img/back-to-top.png"></a>

## Known Issues and Limitations

- Watch mode only works in the Test Explorer UI and doesn't currently work if the `testExplorer.useNativeTesting` config setting is used to disable the Test Explorer UI in favor of VS Code's native testing UI
- Watch mode is not yet supported for the Mocha test framework
- Test descriptions that are computed are currently not supported. Test descriptions must be plain string literals in order to be available in the Test view side bar. For example:
  ```ts
  // Supported
  it('supports plain literal test descriptions', ...
  it(`supports plain literal test descriptions`, ...

  // Not supported
  it('does not support computed ' + someValue + ' test descriptions', ...
  it(`does not support computed ${someValue} test descriptions`, ...
  ```

<a href="#contents"><img align="right" height="24" src="img/back-to-top.png"></a>

---
## See Also

- [Readme](https://github.com/lucono/karma-test-explorer/blob/master/README.md#karma-test-explorer-for-visual-studio-code)
- [Contributing](https://github.com/lucono/karma-test-explorer/blob/master/CONTRIBUTING.md#contributing---karma-test-explorer)
- [Changelog](https://github.com/lucono/karma-test-explorer/blob/master/CHANGELOG.md#changelog)
