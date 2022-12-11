import { Config as KarmaConfig } from 'karma';

export default (config: KarmaConfig, karmaConfigHomePath: string) => {
  // Default config taken from Angular testing configuraton docs:
  // https://angular.io/guide/testing#configuration

  config.set({
    basePath: karmaConfigHomePath,
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
      dir: require('path').join(karmaConfigHomePath, './coverage/'), // eslint-disable-line @typescript-eslint/no-var-requires
      subdir: '.',
      reporters: [{ type: 'html' }, { type: 'text-summary' }]
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
