[![Installs](https://vsmarketplacebadge.apphb.com/installs-short/lucono.karma-test-explorer.svg)](https://marketplace.visualstudio.com/items?itemName=lucono.karma-test-explorer)
[![Rating](https://vsmarketplacebadge.apphb.com/rating-short/lucono.karma-test-explorer.svg)](https://marketplace.visualstudio.com/items?itemName=lucono.karma-test-explorer)
[![Build and Test](https://github.com/lucono/karma-test-explorer/actions/workflows/node.js.yml/badge.svg)](https://github.com/lucono/karma-test-explorer/actions/workflows/node.js.yml)

# Karma Test Explorer (for Angular, Jasmine, and Mocha)

This extension runs your Karma or Angular tests in Visual Studio Code using the [Test Explorer UI](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer), and supports the Jasmine and Mocha test frameworks.

![Karma Test Explorer screenshot](./docs/img/sidebar.png)

It displays rich information about your tests in the Testing side bar (left image), including focused ⚡ and disabled 💤 tests. It also detects duplicated tests in your project and convniently flags them for action. Test results summary, including passed, failed and skipped tests, are displayed in the side bar after each test execution (right image).

---
Please take a minute to rate this extension in the [marketplace](https://marketplace.visualstudio.com/items?itemName=lucono.karma-test-explorer) and star it on [GitHub](https://github.com/lucono/karma-test-explorer/stargazers). For issues, questions, or feature requests, see [Reporting Issues](./docs/documentation.md#reporting-issues).

---

## Why this Extension

Karma Test Explorer is a major rewrite of the deprecated [Angular/Karma Test Explorer](https://github.com/Raagh/angular-karma_test-explorer) extension, and is aimed at facilitating various significant enhancements and new features, with a focus on robust support for:

- Large projects with thousands of tests
- Remote development sceanarios with [Dev Containers](https://code.visualstudio.com/docs/remote/containers)
- Flexibility to support a wide range of testing scenarios and workflows
- Smooth user experience to "just work" without any or much configuration
- Reliability, usability, and productivity

## Features

- Rich visual test browsing, execution, and debugging
- Angular, Karma, Jasmine, and Mocha support
- Multi-project / monorepo / multi-root workspace support
- Live update of pass-fail test statuses
- Filter out noise from disabled tests or show only focused tests
- Duplicate test detection and reporting
- [Much more](./docs/documentation.md#features)

## Quick Start

In many cases, testing should work without any manual configuration. To quickly get started:

- Ensure Chrome browser and the project dependencies are installed
- Install the Karma Test Explorer [extension](https://marketplace.visualstudio.com/items?itemName=lucono.karma-test-explorer) and wait a moment while it initializes
- When done, your tests should be displayed in the Testing side bar
- Use the many [extension settings](./docs/documentation.md#extension-settings) to customize it to any other needs of your project
- If you run into any issues, see [extension setup](./docs/documentation.md#extension-setup) for more detailed setup instructions

## Documentation

For a more detailed guide on setting up, customizing, and fully leveraging all the available features to work for your project, please see the Karma Test Explorer [Documentation](./docs/documentation.md#documentation---karma-test-explorer).

## Acknowledgement

Special thanks to the authors of [Angular/Karma Test Explorer](https://github.com/Raagh/angular-karma_test-explorer) on which Karma Test Explorer is based.

## See Also

[Documentation](./docs/documentation.md#documentation---karma-test-explorer) &nbsp;|&nbsp; [Contributing](./CONTRIBUTING.md#contributing---karma-test-explorer) &nbsp;|&nbsp; [Changelog](./CHANGELOG.md#changelog) &nbsp;|&nbsp; [Report an issue](./docs/documentation.md#reporting-issues)
