# Changelog

All notable changes to the Karma Test Explorer extension will be documented in this file.

The format of this changelog is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this extension uses versioning similar to [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Aug 2021

### Added

- Mocha test framework support
- Karma version 6 support
- Support for [Dev Containers](https://code.visualstudio.com/docs/remote/containers)
- Watch mode support for the Jasmine test framework with continous pass / fail status update
- Support for grouping tests by folder in addition to existing support for grouping by test suite
- Passed, failed, skipped, total count, and execution time stats for tests in the Test view sidebar
- Environment variable support directly in the extension settings or via a `.env` file
- Support for using custom launchers defined in the Karma config or defining one directly in extension settings
- Support for using a custom Karma executable or script
- Support for automatically reloading Karma on changes to the Karma config file
- Support for using a different Karma port than the one in the Karma config for testing in VS Code
- Dedicated `Karma Server` output channel for viewing the Karma server log in VS Code

### Changed

- By default, tests are now grouped by folder rather than by test suite
- Various additional test file naming schemes other than `*.spec.ts` are also now detected by default
- Significantly improved logging and error handling
- More resilient port management to prevent port conflicts

### Fixed

- Fixed various scenarios where code lens would not be rendered due to file and line location of tests not being detected

