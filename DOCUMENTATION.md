## Getting started

- Open the project folder.
- Install the extension.
- Restart VS Code and open the Test view.
- Run your tests using the ![Run](img/run.png) icon.
- Debug tests by setting breakpoints in your code and press the ![Debug](img/debug.png) icon to start debugging.
- If a test failed click on it and you will see the fail information on vscode `Test Explorer` output channel, or gutter decorations inside the spec file.

## Configuration

List of currently used properties:

| Property                                               | Description                                                                                                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `karmaTestExplorer.defaultSocketConnectionPort` | This is the port that will be used to connect Karma with the test explorer                                                                     |
| `karmaTestExplorer.debugMode`                   | This will enable debug mode, which will create a new output channel with detailed logs                                                         |
| `karmaTestExplorer.projectRootPath`             | The working directory where the project is located (relative to the root folder)                                                               |
| `karmaTestExplorer.karmaConfFilePath`           | The path where the karma.conf.js is located (relative to the angular project folder)                                                           |
| `karmaTestExplorer.debuggerConfig`       | If the current debugger for Chrome configuration doesn't work for you, here you can enter your own                                             |

Default VSCode Chrome debugger configuration:

```json
{
  "name": "Debug tests",
  "type": "pwa-chrome",
  "request": "launch",
  "port": 9222,
  "sourceMaps": true,
  "webRoot": "${workspaceRoot}",
  "sourceMapPathOverrides": {
    "webpack:/*": "${webRoot}/*",
    "/./*": "${webRoot}/*",
    "/src/*": "${webRoot}/*",
    "/*": "*",
    "/./~/*": "${webRoot}/node_modules/*"
  }
}
```

No validation is done to the debugger configuration, is your responsibility to setup something that works. You can find documentation for VSCode's JavaScript debugger options [here](https://github.com/microsoft/vscode-js-debug/blob/master/OPTIONS.md).

Port 9999 is used as default for connecting the vscode instance and the karma instance. If you want to use a different port you can change it by
setting the following property:

| Property                                               | Description                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `karmaTestExplorer.defaultSocketConnectionPort` | This is the port that will be used to connect Karma with the test explorer |

If you have multiple instances of vscode open make sure to setup a different port for each instance.

## Advanced Configuration

In some cases your specific projects needs to run on higher node memory to work, people in this cases generally run this command to do `ng test => node --max_old_space_size=4000 ./node_modules/@angular/cli/bin/ng test`
is that is your case you can use the property

| Property                                         | Example                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `karmaTestExplorer.angularProcessCommand` | `node --max_old_space_size=4000 ./node_modules/@angular/cli/bin/ng test` |

If you want to open a folder were the project is just one folder inside your root (for example if you open a root folder and inside you have one folder for the Angular app and another for the API).
You need to let the `Test Explorer` where the Angular app is located inside that root by adding the following extra configuration independent of the type of project:

| Property                                   | Description                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| `karmaTestExplorer.projectRootPath` | The working directory where the project is located (relative to the root folder) |

For `ANGULAR CLI` projects basic configuration is set as `DEFAULT`. Just open the folder and everything should start normally.

For `ANGULAR NON CLI` projects you need to setup the following configuration:

| Property                                     | Description                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `karmaTestExplorer.karmaConfFilePath` | The path where the karma.conf.js is located (relative to the angular project folder) |
| `karmaTestExplorer.projectType`       | 'Angular'                                                                            |

For `KARMA` projects you need to setup the following configuration:

| Property                                     | Description                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `karmaTestExplorer.karmaConfFilePath` | The path where the karma.conf.js is located (relative to the angular project folder) |
| `karmaTestExplorer.projectType`       | 'Karma'                                                                              |

---

## SPECIAL NOTES

### "CANCEL CURRENT RUN" FEATURE

This is a major hack, karma and angular dont support a way to stop current run without
killing the test server, so when you click the cancel button what it really happens is that the test server is killed
and starts again, this involves resources and time but ATM there is no other way of doing it, use at your own risk.

### "DEBUG TESTS" FEATURE

Unfortunately because of limitations inside KarmaTestRunner the debugging session cannot be stopped automatically without restarting the entire karma test enviroment, since this is a very slow process it was decided that the user has to stop the debugging session in VSCODE manually before continuing running tests. If this is not done all consequent runs will be debugged .
