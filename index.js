var path = require('path');
var os = require('os');
var fs = require('fs');
var builder = require('xmlbuilder');

var JUnitReporter = function(baseReporterDecorator, config, emitter, logger, helper, formatError) {
  var outputDir = config.outputDir;
  var pkgName = config.suite;
  var log = logger.create('reporter.junit');

  var suites;
  var pendingFileWritings = 0;
  var fileWritingFinished = function() {};
  var allMessages = [];

  if (outputDir.substr(-1) != '/') {
    outputDir += '/';
  }

  baseReporterDecorator(this);

  this.adapters = [function(msg) {
    allMessages.push(msg);
  }];

  function escapeInvalidXmlChars(str) {
    return str.replace(/\&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/\>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/\'/g, "&apos;");
  }

  function writeToFile(out, outputFile, suite) {
    helper.mkdirIfNotExists(out, function() {

      fs.writeFile(outputFile, suite.end({pretty: true}), function(err) {
        if (err) {
          log.warn('Cannot write JUnit xml\n\t' + err.message);
        } else {
          log.debug('JUnit results written to "%s".', outputFile);
        }

        if (!--pendingFileWritings) {
          fileWritingFinished();
        }
      });
    });
  }

  this.onRunStart = function(browsers) {
    suites = {};

    var suite;
    var timestamp = (new Date()).toISOString().substr(0, 19);
    browsers.forEach(function(browser) {

      // pendingFileWritings++;
      suites[browser.id] = {};
      // suite = suites[browser.id] = builder.create('testsuite');
      // suite.att('name', pkgName ? pkgName + ' / ' + browser.name : browser.name)
      //      .att('timestamp', timestamp)
      //      .att('hostname', os.hostname());
      // suite.ele('properties')
      //      .ele('property', {name: 'browser.fullName', value: browser.fullName});
    });
  };

  this.onBrowserComplete = function(browser) {
    var suitelist = suites[browser.id];
    var result = browser.lastResult;
    var out = path.join(outputDir, browser.name);

    for(var prop in suitelist){
      if(suitelist.hasOwnProperty(prop)){
        var suite = suitelist[prop];
        var node = suite.node;
        // var outputFile = out + '/' + 'TEST-' + prop.replace(/ /g, '_') + '.xml';
        var outputFile = outputDir + 'TEST-' + browser.name.replace(/ /g, '_') + '-' + suite.name.replace(/ /g, '_') + '.xml';
        node.att('tests', suite.total);
        node.att('errors', suite.error);
        node.att('failures', suite.failed);
        node.att('time', (suite.time || 0) / 1000);

        node.ele('system-out').dat(allMessages.join() + '\n');
        node.ele('system-err');

        writeToFile(outputDir, outputFile, node);
      }
    };
    
  };

  this.onRunComplete = function() {
    suites = null;
    allMessages.length = 0;
  };

  this.specSuccess = this.specSkipped = this.specFailure = function(browser, result) {
    var testsuiteName = result.suite.join(' ').replace(/\./g, '_');
    var browserName = browser.name.replace(/\./g, '_');
    var suite = suites[browser.id][testsuiteName];
    var node = suite ? suite.node : {};
    if(!suite){
      pendingFileWritings++;
      suite = suites[browser.id][testsuiteName] = {
        name: testsuiteName,
        total: 0,
        error: 0,
        failed: 0,
        time: 0
      };
      node = suite.node = builder.create('testsuite');
      node.att('name', (pkgName ? pkgName + ' - ' + browserName : browserName) +  '.' + testsuiteName) 
           .att('timestamp', (new Date()).toISOString().substr(0, 19))
           .att('hostname', os.hostname());
      node.ele('properties')
           .ele('property', {name: 'browser.fullName', value: browser.fullName});
    }

    suite.time += result.time;
    suite.total ++;
    suite.error += (result.disconnected || result.error ? 1 : 0);

    var spec = node.ele('testcase', {
      name: result.description,
      time: ((result.time || 0) / 1000),
      classname: (pkgName ? pkgName + '.' : '') + testsuiteName
    });
    if (result.skipped) {
      node.ele('skipped');
    }

    if (!result.success) {
      suite.failed ++;
      result.log.forEach(function(err) {
        spec.ele('failure', {type: ''}, formatError(err));
      });
    }
  };

  // TODO(vojta): move to onExit
  // wait for writing all the xml files, before exiting
  emitter.on('exit', function(done) {
    if (pendingFileWritings) {
      fileWritingFinished = done;
    } else {
      done();
    }
  });
};

JUnitReporter.$inject = ['baseReporterDecorator', 'config.junitReporter', 'emitter', 'logger',
    'helper', 'formatError'];

// PUBLISH DI MODULE
module.exports = {
  'reporter:adnjunit': ['type', JUnitReporter]
};
