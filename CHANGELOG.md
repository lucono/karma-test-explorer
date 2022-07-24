# Changelog

All notable changes to the Karma Test Explorer extension will be documented in this file.

The format of this changelog is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this extension uses versioning similar to [semantic versioning](https://semver.org/spec/v2.0.0.html).

<details>
  <summary>Releases</summary>

  - [0.7.1 - Jul 23, 2022](#071---jul-23-2022)
  - [0.7.0 - Jul 17, 2022](#070---jul-17-2022)
  - [0.6.1 - Apr 13, 2022](#061---apr-13-2022)
  - [0.6.0 - Apr 6, 2022](#060---apr-6-2022)
  - [0.5.0 - Jan 23, 2022](#050---jan-23-2022)
  - [0.4.0 - Dec 5, 2021](#040---dec-5-2021)
  - [0.3.0 - Nov 6, 2021](#030---nov-6-2021)
  - [0.2.1 - Oct 24, 2021](#021---oct-24-2021)
  - [0.2.0 - Oct 13, 2021](#020---oct-13-2021)
  - [0.1.0 - Sep 28, 2021](#010---sep-28-2021)
</details>


---
## [0.7.1] - Jul 23, 2022

### Added

- Support for parameterized tests and template string test descriptions, as well as some support for computed string test descriptions. This support builds on the new AST-based Test Definition Provider added in the v0.7.0 release, and requires the `karmaTestExplorer.testParsingMethod` setting to be `ast` (the current default when this setting is not configured)

---
## [0.7.0] - Jul 17, 2022

### Added

- Support for monorepo multi-project setups for testing. This is in addition to existing support for multi-project Angular workspaces, and VS Code multi-root workspaces
- The last set of loaded projects for testing are now remembered and restored each time a workspace is reopened in VS Code
- New Babel-based AST parser implementation for parsing test files
- New `karmaTestExplorer.testParsingMethod` extension setting for specifying how tests should be parsed by default
- New `karmaTestExplorer.projects` extension setting for specifying and configuring multiple individual projects within the workspace for testing

### Changed

- The `karmaTestExplorer.defaultAngularProjects` extension setting has been deprecated as the set of previously loaded projects are now restored each time the workspace is reopened
- The `karmaTestExplorer.testsBasePath` extension setting, when no value is configured, now defaults to the longest common path of the tests discovered in the project
- The new Babel-based AST parser, instead of regular expression matching, is now used for parsing test files by default

### Fixed

- Fixed an [issue](https://github.com/lucono/karma-test-explorer/issues/34) that prevented the extension from working for projects that use plug-n-play package managers and setups
- Addressed [CVE-2021-43138](https://github.com/advisories/GHSA-fwr7-v2mv-hh25) security vulnerability from transitive dependencies

---
## [0.6.1] - Apr 13, 2022

### Fixed

- Fixed an [issue](https://github.com/lucono/karma-test-explorer/issues/29) that prevented the extension from working for environments with Node v12 and lower

---
## [0.6.0] - Apr 6, 2022

### Added

- Support for [requested](https://github.com/lucono/karma-test-explorer/issues/27) feature for simultaneous testing of multiple projects in an Angular workspace
- New folder button on the test toolbar for choosing workspace projects loaded for testing in the UI
- New `karmaTestExplorer.defaultAngularProjects` extension setting for specifying one or more projects in the Angular workspace that should be launched by default when the workspace is opened in VS Code

### Changed

- The `karmaTestExplorer.defaultAngularProjectName` extension setting has been deprecated in favor of the new `karmaTestExplorer.defaultAngularProjects` setting which supports specifying multiple default startup projects

### Fixed

- Fixed an [issue](https://github.com/lucono/karma-test-explorer/issues/25) in which the Karma server is not always terminated after VS Code is closed
- Fixed an [issue](https://github.com/lucono/karma-test-explorer/issues/22) with unexpected test pass/fail highlighting behavior
- Addressed [CVE-2022-21704](https://github.com/advisories/GHSA-82v2-mx6x-wq7q), [CVE-2022-21676](https://github.com/advisories/GHSA-273r-mgr4-v34f), and [CVE-2022-21670](https://github.com/advisories/GHSA-6vfc-qv3f-vr6c) security vulnerabilities from transitive dependencies


---
## [0.5.0] - Jan 23, 2022

_Karma Test Explorer is officially out of Preview!_

### Added

- New `karmaTestExplorer.projectType` config setting for overriding the auto-detected project type (Karma or Angular) if required
- New `karmaTestExplorer.webRoot` config setting for providing the web root used when debugging Karma tests in VS Code
- New `karmaTestExplorer.pathMapping` config setting for providing path mappings used when debugging Karma tests in VS Code
- New `karmaTestExplorer.sourceMapPathOverrides` config setting for providing source map path overrides used when debugging Karma tests in VS Code

### Changed

- Files prefixed or suffixed with `unit` are no longer auto-detected as test files by default as that can often also capture non-test files. The `karmaTestExplorer.testFiles` extension setting can still be used to include them when desired
- Less noisy `INFO` and `WARN` level logging
- Removed extension `Preview` designation after an extended period of relative stability without any major new bugs reported

### Fixed

- Fixed an issue where tests having the test description on a separate line from the starting line of the `describe` or `it` test definition are not recognized
- Addressed [CVE-2022-0155](https://github.com/advisories/GHSA-74fj-2j2h-c42q) security vulnerability from a transitive dependency


---
## [0.4.0] - Dec 5, 2021

### Added

- Number of focused and disabled tests are now shown for each test suite or folder
- New `karmaTestExplorer.excludeDisabledTests` extension setting for excluding disabled tests from the test view
- New `karmaTestExplorer.showOnlyFocusedTests` extension setting for showing only currently focused tests in the test view
- New `karmaTestExplorer.showTestDefinitionTypeIndicators` extension setting for showing or hiding focused and disabled test indicators in the test view
- New `karmaTestExplorer.showUnmappedTests` extension setting for showing or excluding unmapped tests which are reported by Karma but not captured by the set of files defined by the `karmaTestExplorer.testFiles` extension setting
- New `karmaTestExplorer.allowGlobalPackageFallback` extension setting which enables using a global Karma or Angular package installation when none is locally installed in the project folder
- New `karmaTestExplorer.enableExtension` extension setting for explicitly enabling or disabling the extension for a project workspace

### Changed

- Automatic extension activation for a project is now based on the presence of Karma Test Explorer settings or a Karma dev dependency in the project `package.json` file. Previously, extension activation was based on the presence of a Karma or Angular configuration file under the project folder
- All tests which are reported by Karma are now shown in the test view, with a new option (`karmaTestExplorer.showUnmappedTests`) added to exclude them if desired. Previously, tests not captured by the `karmaTestExplorer.testFiles` extension setting would not be shown at all
- Global installations of Karma or Angular are no longer used by default when no local installation is found in the project. This behavior must now be explicitly enabled through a new `karmaTestExplorer.allowGlobalPackageFallback` extension setting

### Fixed

- Fixed an [issue](https://github.com/lucono/karma-test-explorer/issues/16) where debug sessions time out after 60 seconds while paused on a breakpoint
- Fixed an [issue](https://github.com/lucono/karma-test-explorer/issues/12) where the wrong Node binary is used for starting Karma in certain cases. The corresponding Node binary of the default `npx` installation on the system path is now preferred for launching Karma. Previously, the first Node binary on the path was preferred
- Fixed an issue where tests defined on the first line of a test file are not recognized by Karma Test Explorer

---
## [0.3.0] - Nov 6, 2021

### Added

- New `karmaTestExplorer.nonHeadlessModeEnabled` extension setting for running tests in non-Headless mode
- New `karmaTestExplorer.karmaReporterLogLevel` extension setting for specifying the level of logging detail for Karma Test Explorer's Karma reporter plugin

### Changed

- Karma Test Explorer is now only activated for a workspace folder if it contains one or more Karma Test Explorer configuration settings, or a known standard config file for Karma or Angular projects exists somewhere under the project folder tree, with the exclusion of the `node_modules` folder

### Fixed

- Fixed an [issue](https://github.com/lucono/karma-test-explorer/issues/9) where the extension fails to start for Windows users if the user's profile path contains a space
- Fixed an [issue](https://github.com/lucono/karma-test-explorer/issues/10) where test discovery or execution sometimes fails on a Karma error indicating that some of the tests performed a full page reload
- Fixed an [issue](https://github.com/lucono/karma-test-explorer/issues/7) where some Karma reporters configured in the user's Karma config file would cause the extension to fail to start
- Fixed an issue which increases the number of test failure scenarios where the precise test expectation that failed can be highlighted. Previously, only the parent test containing the failed expectation was ever highlighted
- Fixed an issue where changes to test files, and changes to the Karma config and other watched files, were not always detected and reflected in the test view and did not always trigger the appropriate refresh behavior

---
## [0.2.1] - Oct 24, 2021

### Changed

- Test duplication is no longer reported for test suites because test suites are simply containers for tests, so that duplicated test suites are themselves not an indication of actual test duplication

### Fixed

- Fixed an issue where test duplicate detection was producing false-positives on Windows (thanks [@nwash57](https://github.com/nwash57)!)
- Fixed an issue where some tests may not always be discovered on Windows

---
## [0.2.0] - Oct 13, 2021

### Added

- Automatic detection of the test framework in use by the project
- Automatic detection of when testing in a container to apply helpful optimizations
- New prompt for applying settings updates when they are changed
- New `karmaTestExplorer.angularProcessCommand` config setting for specifying a custom command or executable for Angular
- New `karmaTestExplorer.failOnStandardError` config setting that can be useful for uncovering testing issues

### Changed

- Watch mode (the `autoWatchEnabled` setting) is now enabled by default
- When not set, the `autoWatchBatchDelay` setting now defaults to the configured or default value in the project's Karma config file. Previously, this value always defaulted to 5 secs and you had to explicitly set it to the same value as the project Karma config if desired
- The `karmaTestExplorer.karmaProcessExecutable` config setting has been renamed to `karmaTestExplorer.karmaProcessCommand`, aligning the naming of both it and the newly added `karmaTestExplorer.angularProcessCommand` setting
- The `karmaTestExplorer.containerModeEnabled` boolean setting has been renamed to an enum `karmaTestExplorer.containerMode` setting, with possible values of `auto` (the default when not set), `enabled`, or `disabled`. Without updating existing pfoject configurations, this should not casue any change in behavior for projects already using the old setting to enable container mode because the new setting's default value of `auto` will allow container-based environments to still be detected and optimized by default
- Test files that are auto-detected by default has expanded to also include filenames starting with `test` or `spec` or `unit`, followed by a dot (`.`) or a hyphen (`-`) or an underscore (`_`). Previously, only those ending with `test` or `spec` or `unit`, preceded with a dot (`.`) or a hyphen (`-`) or an underscore (`_`) would be detected by default
- The `node_modules` folder is now always excluded from search during test discovery even if the `karmaTestExplorer.excludeFiles` setting is specified without explicitly having `node_modules` on the excluded list. Previously, this would cause `node_modules` not to be excluded

### Fixed

- Fixed [an issue](https://github.com/lucono/karma-test-explorer/issues/2) (#2) where spaces in the user's home directory or the extension installation path caused the extension to fail for Windows users
- Fixed issue where line numbers shown in warning messages for detected duplicate test definitions were off by one line

---
## [0.1.0] - Sep 28, 2021

### Added

- Mocha test framework support
- Karma version 6 support
- Support for [Dev Containers](https://code.visualstudio.com/docs/remote/containers)
- Watch mode support for the Jasmine test framework with continous pass / fail status update
- Support for grouping tests by folder in addition to existing support for grouping by test suite
- Passed, failed, skipped, total count, and execution time stats for tests in the Test view side bar
- Detection and flagging of duplicate tests in the Test view side bar
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

---
## See Also

- [Readme](./README.md#karma-test-explorer-for-visual-studio-code)
- [Documentation](./docs/documentation.md#documentation---karma-test-explorer)
- [Contributing](./CONTRIBUTING.md#contributing---karma-test-explorer)
