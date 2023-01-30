[![Build and Test](https://github.com/lucono/karma-test-explorer/actions/workflows/node.js.yml/badge.svg)](https://github.com/lucono/karma-test-explorer/actions/workflows/node.js.yml)

# Karma Test Explorer (for Angular, Jasmine, and Mocha)

This extension adds a rich and fully integrated testing experience to Visual Studio Code for TypeScript, JavaScript, or Angular projects that use [Karma](https://karma-runner.github.io/latest/index.html) for testing.

![Karma Test Explorer screenshot](docs/img/sidebar.png)

It displays rich information about your tests in the Testing side bar (left image), including focused ⚡ and disabled 💤 tests. It also detects duplicated tests in your project and convniently flags them for action. Test results summary, including passed, failed and skipped tests, are displayed in the side bar after each test execution (right image).

---
Please take a minute to rate this extension in the [marketplace](https://marketplace.visualstudio.com/items?itemName=lucono.karma-test-explorer) and star it on [GitHub](https://github.com/lucono/karma-test-explorer/stargazers). For issues, questions, or feature requests, see [Reporting Issues](docs/documentation.md#reporting-issues).

---

## Why this Extension

Karma Test Explorer is a complete rewrite of the deprecated [Angular/Karma Test Explorer](https://github.com/Raagh/angular-karma_test-explorer), and adds various significant enhancements and new features to provide robust support for:

- Cloud and remote development sceanarios with [Dev Containers](https://code.visualstudio.com/docs/remote/containers)
- Good performance with large projects having many thousands of tests
- Zero-configuration user experience that "just works" for most setups
- Flexibility to support a wide range of testing scenarios and workflows
- Reliability, usability, and productivity

## Features

- Rich visual test browsing, execution, and debugging
- Angular, Karma, Jasmine, and Mocha support
- Multi-project / monorepo / multi-root workspace support
- Live test validation of changing product code
- Auto-detect and recommend fixes for various testing issues
- [Much more](docs/documentation.md#features)

## Quick Start

In many cases, testing should work out of the box:

- Ensure Chrome browser and the project dependencies are installed
- Install the Karma Test Explorer [extension](https://marketplace.visualstudio.com/items?itemName=lucono.karma-test-explorer) and wait a moment while it initializes
- When done, your tests should be displayed in the Testing side bar
- Use the many [extension settings](docs/documentation.md#extension-settings) to customize it to any other needs of your project
- If you run into any issues, see [extension setup](docs/documentation.md#extension-setup) for more detailed setup instructions

## Documentation

For a more detailed guide on setting up, customizing, and fully leveraging all the available features to work for your project, please see the Karma Test Explorer [Documentation](docs/documentation.md#documentation---karma-test-explorer).

## Acknowledgement

Special thanks to the authors of the deprecated [Angular/Karma Test Explorer](https://github.com/Raagh/angular-karma_test-explorer) on which Karma Test Explorer was originally based.

## See Also

[Documentation](docs/documentation.md#documentation---karma-test-explorer) &nbsp;|&nbsp; [Contributing](CONTRIBUTING.md#contributing---karma-test-explorer) &nbsp;|&nbsp; [Changelog](CHANGELOG.md#changelog) &nbsp;|&nbsp; [Report an issue](docs/documentation.md#reporting-issues)
