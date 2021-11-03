<a href="https://github.com/lucono/karma-test-explorer/actions/workflows/node.js.yml"><img align="right" src="https://github.com/lucono/karma-test-explorer/actions/workflows/node.js.yml/badge.svg"></a>

# Karma Test Explorer for Visual Studio Code

This extension lets you run your Karma or Angular tests in Visual Studio Code using the [Test Explorer UI](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer), and supports both the Jasmine and Mocha test frameworks. It is based on the [Angular/Karma Test Explorer](https://github.com/Raagh/angular-karma_test-explorer) extension, with various significant enhancements that are outlined in [Why this Extension](#why-this-extension) below.

![Karma Test Explorer screenshot](docs/img/extension-screenshot.png)

## Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
- [Why this Extension](#why-this-extension)
- [Acknowledgement](#acknowledgement)
- [Reporting Issues](#reporting-issues)
- [See Also](#see-also)

## Features

### Core Features

- Angular and Karma project support
- Jasmine and Mocha test framework support
- Karma version 6 support
- Support for [Dev Containers](https://code.visualstudio.com/docs/remote/containers)
- Watch mode support with auto pass / fail test status update
- Group and run tests by folder or by test suite
- Duplicate test detection and reporting
- Specify or override environment variables for Karma
- Run your tests in VS Code using any custom launcher in the Karma config file
- Auto-reload Karma when karma config or other files change
- Automatic port management prevents any port conflicts when running tests
- Support for using a custom Karma executable or script (enables greater automation and integration with other processes and workflows)
- Config option to easily switch Karma server to debug logging

### UI Features

- Shows your Karma tests in a visual test explorer in VS Code
- Adds code lenses to your test files to easily run individual tests or suites
- Adds gutter decorations to your test files that show the status of each test
- Adds line decorations to your test files that show the failure message at the point of each test failure

<a href="#contents"><img align="right" height="24" src="docs/img/back-to-top.png"></a>

## Quick Start

Karma Test Explorer uses reasonable defaults that in many cases means it will work out-of-the-box without any configuration. Nonetheless, specific configuration to the particular needs of your project can often bring additional performance, usability and features that increase the productivity and value of the extension to you and your team.

To quickly get started:

- Ensure the required dependencies are installed - Chrome browser on the computer or container, and the project dependencies (such as Karma, Angular, Jasmine, Mocha, etc)
- Install the Karma Test Explorer [extension](https://marketplace.visualstudio.com/items?itemName=lucono.karma-test-explorer)
- If the project root path is not same as the VS Code workspace root, specify its path using the `karmaTestExplorer.projectRootPath` setting
- If the `karma.conf.js` file is not at the project root folder, specify its path using the `karmaTestExplorer.karmaConfFilePath` setting
- Specify your project's test files using the `karmaTestExplorer.testFiles` setting
- Apply the updated settings and wait a moment while it refreshes, or simply restart VS Code
- When done, you should see your tests in the Test View, and code lenses above each test in the editor, either of which can be used to run and debug the tests

---
Also explore the many other [extension settings](https://github.com/lucono/karma-test-explorer/blob/master/docs/documentation.md#configuration) to further customize it to the needs of your project and team, and if you run into any issues with setup or usage, please see the more detailed [Documentation](https://github.com/lucono/karma-test-explorer/blob/master/docs/documentation.md#documentation---karma-test-explorer) for help.

---

<a href="#contents"><img align="right" height="24" src="docs/img/back-to-top.png"></a>

## Documentation

For a more detailed guide on how to setup Karma Test Explorer to work with your project, customizing and fully leveraging all its features, and other helpful documentation around common scenarios and potential issues, please see the more detailed [Documentation](https://github.com/lucono/karma-test-explorer/blob/master/docs/documentation.md#documentation---karma-test-explorer).

<a href="#contents"><img align="right" height="24" src="docs/img/back-to-top.png"></a>

## Why this Extension

The Karma Test Explorer extension was initially created out of [need for additional features](https://github.com/Raagh/angular-karma_test-explorer/issues?q=is%3Aissue+author%3Alucono) from the [Angular/Karma Test Explorer](https://github.com/Raagh/angular-karma_test-explorer) extension at a time when that project seemed not to be accepting contributions anymore, and is a major rewrite aimed at facilitating various significant enhancements and new features (such as some of those in the initial release [changelog](https://github.com/lucono/karma-test-explorer/blob/master/CHANGELOG.md#010---sep-28-2021)). 

This extension's core focus is on better and robust support for:

- Large projects with thousands of tests
- Remote development sceanarios with [Dev Containers](https://code.visualstudio.com/docs/remote/containers)
- Flexibility to support a wide range of testing scenarios and workflows
- Reliability, usability, and team productivity

<a href="#contents"><img align="right" height="24" src="docs/img/back-to-top.png"></a>

## Acknowledgement

Special thanks to the [author](https://github.com/Raagh) and contributors of the [Angular/Karma Test Explorer](https://github.com/Raagh/angular-karma_test-explorer) extension on which Karma Test Explorer is based.

## Reporting Issues

If you encounter any problems using Karma Test Explorer, would like to request a feature, or have any questions, please open an issue [here](https://github.com/lucono/karma-test-explorer/issues/new/choose).

## See Also

- [Documentation](https://github.com/lucono/karma-test-explorer/blob/master/docs/documentation.md#documentation---karma-test-explorer)
- [Contributing](https://github.com/lucono/karma-test-explorer/blob/master/CONTRIBUTING.md#contributing---karma-test-explorer)
- [Changelog](https://github.com/lucono/karma-test-explorer/blob/master/CHANGELOG.md#changelog)
