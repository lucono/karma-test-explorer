# Contributing - Karma Test Explorer

## Contents

- [Recommended Areas of Focus](#recommended-areas-of-focus)
- [Setup and Development](#setup-and-development)
- [Building and Testing the Code](#building-and-testing-the-code)
- [See Also](#see-also)

## Recommended Areas of Focus

Contributions to the Karma Test Explorer are welcome, particularly in the core areas of focus mentioned in the [Why this Extension](./README.md#why-this-extension) section. Other particular areas, among others, include:

- Migrating to the native VS Code test API
- Enhancing the level of Angular and Mocha support
- Adding support for code coverage
- Increasing test coverage
- Any general updates that make contributing easier

<a href="#contents"><img align="right" height="24" src="docs/img/back-to-top.png"></a>

## Setup and Development

The Karma Test Explorer project is pre-configured for development in a [Dev Container](https://code.visualstudio.com/docs/remote/containers), making it quick and easy to get setup and contributing to the project.

- Fork and clone the [project repo](https://github.com/lucono/karma-test-explorer) and open it in VS Code
- Select the option to Reopen in Container, which will build the container if not already previously done, and install all project dependencices
- Create a branch with a short descriptive name for the new or existing bug or feature for which you wish to contribute, naming feature branches with a _feature_ prefix (eg. `feature/my-feature-description`) and bugfixes with a _bugfix_ prefix (eg. `bugfix/bug-description`)
- Code your contributions in the branch, ensuring to include:
  - Unit tests that adequately cover, at a minimum, the functionality for the feature or bugfix being contributed
  - Any new documentation and updates to existing documentation related to the feature or bugfix being contributed
- Create a pull request with your proposed contribution, ensuring that it is linked to the GitHub issue for the related bug or feature
- In the pull request description, include a summary of the changes in the pull request
- Ensure the pull request passes the CI build and all other CI checks

<a href="#contents"><img align="right" height="24" src="docs/img/back-to-top.png"></a>

## Building and Testing the Code

For linting and building the code, and running unit tests, you can use the following:

  Command | Action
  --------|-------
  <code>npm&nbsp;run&nbsp;build</code> | Build the project
  <code>npm&nbsp;run&nbsp;test</code>  | Run the unit tests for the project. Jest is used for unit testing
  <code>npm&nbsp;run&nbsp;lint</code>  | Run linting on the project files. ESLint is used for linting
  <code>npm&nbsp;run&nbsp;validate</code> | Validate your changes before creating a pull request. This runs all build actions

<a href="#contents"><img align="right" height="24" src="docs/img/back-to-top.png"></a>

## See Also

- [Readme](./README.md#karma-test-explorer-for-visual-studio-code)
- [Documentation](./docs/documentation.md#documentation---karma-test-explorer)
- [Changelog](./CHANGELOG.md#changelog)
