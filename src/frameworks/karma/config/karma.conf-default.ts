import { Config as KarmaConfig } from 'karma';
import { join } from 'path';

export interface KarmaDefaultConfigOptions {
  karmaConfigHomePath: string;
  // TODO: Add a field for code coverage generation path
}

export default (config: KarmaConfig, options: KarmaDefaultConfigOptions) => {
  // Default config taken from Angular testing configuraton docs:
  // https://angular.io/guide/testing#configuration

  config.set({
    basePath: options.karmaConfigHomePath,
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      'karma-jasmine',
      'karma-chrome-launcher',
      'karma-jasmine-html-reporter',
      'karma-coverage',
      '@angular-devkit/build-angular/plugins/karma'
    ],
    client: {
      clearContext: false
    },
    jasmineHtmlReporter: {
      suppressAll: true
    },
    coverageReporter: {
      dir: join(options.karmaConfigHomePath, './coverage/'),
      subdir: '.',
      reporters: [{ type: 'lcov' }, { type: 'text-summary' }]
    },
    reporters: ['progress', 'kjhtml'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    browsers: ['Chrome'],
    singleRun: false,
    restartOnFileChange: true
  });
};
