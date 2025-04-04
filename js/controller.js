class Controller {
  /**
   * Create a new controller.
   */
  constructor() {
    this.parsers = {};
    this.triggers = {};
    this.triggerCount = 0;
    this.triggerData = {};
    this.triggerAsyncMap = {};
    this.triggerAsync = [];
    this.successful = [];
    this.cooldowns = {};
    this.initTriggers = [];
    this.addParser('controller', this);
    this.addTrigger('OnInit', 'controller');
    this.addSuccess('controller');
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.eventId = 0;
    this.eventIdQueue = async.queue(this.setupTrigger.bind(this), 1);
  }

  /**
   * Add a new parser to the controller.
   * @param {string} name name to use for the parser
   * @param {Handler} instance parser object to add
   */
  addParser(name, instance) {
    this.parsers[name.toLowerCase()] = instance;
  }

  /**
   * Add to the list of successfully initialized parsers.
   * @param {string} name name to use for the parser
   */
  addSuccess(name) {
    if (this.successful.indexOf(name) === -1) {
      this.successful.push(name.toLowerCase());
    }
  }

  /**
   * Retrieve a list of parsers that failed to initialize.
   */
  getUnsuccessful() {
    var unsuccessful = [];
    Object.keys(this.parsers).forEach((parser, i) => {
      if (this.successful.indexOf(parser) === -1) {
        unsuccessful.push(parser);
      }
    });
    return unsuccessful;
  }

  /**
   * Get a parser by name.
   * @param {string} name name of the handler
   * @return {Handler|null} the parser or null if none exists
   */
  getParser(name) {
    name = name.toLowerCase();
    if (this.parsers[name]) {
      return this.parsers[name];
    } else {
      return null;
    }
  }

  /**
   * Add a new trigger to the controller.
   * @param {string} trigger id of the trigger
   * @param {string} name name of parser that handles the trigger
   */
  addTrigger(trigger, name) {
    this.triggers[trigger.toLowerCase()] = name.toLowerCase();
  }

  /**
   * Get a trigger by name.
   * @param {string} trigger name of the trigger
   * @return {Handler|null} the parser or null if none exists
   */
  getTrigger(trigger) {
    trigger = trigger.toLowerCase();
    if (this.triggers[trigger]) {
      return this.triggers[trigger];
    } else {
      console.error('Unable to find trigger for input: ' + trigger);
      return null;
    }
  }

  /**
   * Register trigger from user input.
   * @param {string} trigger name to use for the handler
   * @param {array} triggerLine contents of trigger line
   * @param {number} id of the new trigger
   */
  addTriggerData(trigger, triggerLine, triggerId) {
    this.initTriggers.push(triggerId);
  }

  /**
   * Called before parsing user input.
   */
  preParse() {
    return;
  }

  /**
   * Called after parsing all user input.
   */
  postParse() {
    return;
  }

  runInit() {
    this.initTriggers.forEach(triggerId => {
      this.handleData(triggerId);
    });
  }

  /**
   * Setup async queue for given trigger id
   * @param {string} triggerId id of the trigger to run
   */
  async handleData(triggerId, triggerParams) {
    this.eventIdQueue.push({
      triggerId: triggerId,
      triggerParams: triggerParams
    });
  }

  async setupTrigger(data, callback) {
    var { triggerId, triggerParams } = data;
    triggerParams = triggerParams || {};
    triggerParams['_kc_event_id_'] = this.eventId;
    if (this.eventId === 1000000000) {
      this.eventId = 0;
    } else {
      this.eventId = this.eventId + 1;
    }
    if (typeof(this.triggerAsyncMap[triggerId]) !== "undefined") {
      var queue = this.triggerAsync[this.triggerAsyncMap[triggerId]];
      queue.push({
        triggerId: triggerId,
        triggerParams: triggerParams
      });
    } else {
      this.performTrigger({
        triggerId: triggerId,
        triggerParams: triggerParams
      }, null);
    }
  }

  /**
   * Perform the trigger content.
   * @param {Object} triggerInfo id and params of the trigger
   */
  async performTrigger(triggerInfo, callback) {
    try {
      var toSkip = 0;
      var triggerId = triggerInfo.triggerId;
      var triggerParams = triggerInfo.triggerParams;
      triggerParams['_successful_'] = this.successful.join(', ');
      triggerParams['_unsuccessful_'] = this.getUnsuccessful().join(', ');

      // Get trigger content
      var triggerSequence = JSON.parse(JSON.stringify(this.triggerData[triggerId]));

      // Setup regex for any parameters
      var triggerRegex = null;
      if (Object.keys(triggerParams).length > 0) {
        triggerRegex = new RegExp('{' + Object.keys(triggerParams).join('}|{') + '}|\\[' + Object.keys(triggerParams).join('\\]|\\[') + '\\]', 'gi');
      }

      // Run through actions
      for (var i = 0; i < triggerSequence.length; i++) {
        if (toSkip > 0) {
          toSkip--;
        } else {
          var data = triggerSequence[i];
          var run_data = [];

          // If need to check for parameters
          if (triggerRegex) {
            for (var j = 0; j < data.length; j++) {
              // Copy data into new array to avoid replacing directly
              run_data.push(data[j])

              // Find and replace all matches
              var result = run_data[j].match(triggerRegex);
              while (result) {
                result.forEach(match => {
                  if (match.charAt(0) === '[') {
                    var replacement = JSON.stringify(triggerParams[match.substring(1, match.length - 1)]);
                    run_data[j] = run_data[j].replace(match, replacement);
                  } else {
                    run_data[j] = run_data[j].replace(match, triggerParams[match.substring(1, match.length - 1)]);
                  }
                });
                result = run_data[j].match(triggerRegex);
              }
            }
          } else {
            run_data = data;
          }

          // Execute action
          var runParams = await this.runTrigger(run_data, triggerParams);

          // Handle parameters returned by action
          if (runParams) {
            // If continue param set to false, exit trigger
            if (runParams.continue === false) {
              return;
            }

            if (runParams["_trigId"]) {
              var inNum = 1;
              while (triggerParams[`in${inNum}`]) {
                delete triggerParams[`in${inNum}`];
                inNum++;
              }
              runParams["_trigId"].forEach(trigId => {
                var trigSequence = JSON.parse(JSON.stringify(this.triggerData[trigId]));
                triggerSequence.splice(i+1, 0, ...trigSequence);
              });
              delete runParams["_trigId"];
            }

            if (runParams.skip) {
              toSkip = runParams.skip;
              delete runParams.skip;
            }

            if (runParams.actions) {
              runParams.actions.forEach((item, i) => {
                runParams.actions[i] = shlexSplit(item);
              });

              triggerSequence.splice(i+1, 0, ...runParams.actions);
              delete runParams.actions;
            }

            if (runParams.loops && runParams.lines) {
              var toLoop = triggerSequence.slice(i + 1, i + runParams.lines + 1);
              for (var loopLine = 0; loopLine < runParams.loops - 1; loopLine++) {
                triggerSequence.splice(i+1, 0, ...toLoop);
              }
              delete runParams.loops;
              delete runParams.lines;
            }

            // Recreate regex with new params
            Object.keys(runParams).forEach(attribute => {
              triggerParams[attribute] = runParams[attribute];
            });
            triggerRegex = new RegExp('{' + Object.keys(triggerParams).join('}|{') + '}|\\[' + Object.keys(triggerParams).join('\\]|\\[') + '\\]', 'gi');
          }
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Perform the action content.
   * @param {array} data action to perform
   * @param {object} parameters current event parameters
   */
  async runTrigger(data, parameters) {
    var parserName = data[0].toLowerCase();
    if (parserName === 'delay') {
      // Custom delay handler
      await timeout(parseFloat(data[1]) * 1000);
    }
    else if (parserName === 'skip') {
      var lines = parseInt(data[1]);
      return { skip: lines };
    }
    else if (parserName === 'loop') {
      var lines = parseInt(data[1]);
      var loops = parseInt(data[2]);
      return { lines: lines, loops: loops };
    }
    else if (parserName === 'exit') {
      return { continue: false };
    }
    else if (parserName === 'reset') {
      // Custom reset
      location.reload(true);
    }
    else if (parserName === 'play') {
      // Play audio and await the end of the audio
      var audio = new Audio("sounds/" + data.slice(3).join(' ').trim());
      var source = this.audioContext.createMediaElementSource(audio);
      var gainNode = this.audioContext.createGain();
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      var volume = parseInt(data[1]);
      if (!isNaN(volume)) {
        audio.volume = 1;
        gainNode.gain.value = volume / 100;
      }
      if (data[2].toLowerCase() === 'wait') {
        await new Promise((resolve) => {
          audio.onended = () => {
            gainNode.disconnect();
            resolve();
          }
          var playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.then(function() {
              // Automatic playback started!
            }).catch(function(error) {
              console.error(`[${error.code}] ${error.name}: ${error.message}`);
              gainNode.disconnect();
              resolve();
            });
          }
        });
      } else {
        audio.play();
        audio.onended = () => gainNode.disconnect();
      }
    }
    else if (parserName === 'cooldown') {
      var action = data[1].toLowerCase();
      var res = {};
      if (action === 'check') {
        var name = data[2];
        var res = await this.checkCooldown(name);
      } else {
        var name = data[2];
        var duration = parseFloat(data[3]);
        var res = await this.handleCooldown(name, duration);
      }

      return res;
    }
    else if (parserName === 'if') {
      var res = await this.handleIf(data);
      return res;
    }
    else if (parserName === 'eval') {
      var evaluation = data.slice(1).join(' ');
      var res = await eval(evaluation);
      return res;
    }
    else if (parserName === 'function') {
      var func = data.slice(1).join(' ');
      var fn = new Function(func);
      var res = fn();
      return res;
    }
    else if (parserName === 'asyncfunction') {
      var func = data.slice(1).join(' ');
      var fn = new AsyncFunction(func);
      var res = await fn();
      return res;
    }
    else if (parserName === 'error') {
      var message = data.slice(1).join(' ');
      console.error(message);
    }
    else if (parserName === 'log') {
      var message = data.slice(1).join(' ');
      console.log(message);
    }
    else {
      // Get parser and run trigger content
      var parser = this.getParser(parserName);
      if (!parser) parser = this.getParser('Actions');
      if (parser) {
        return await parser.handleData(data, parameters);
      }
    }
  }

  /**
   * Check the named cooldown.
   *
   * @param {string} name name of the cooldown
   * @return {Object} whether or not to continue the trigger.
   */
  checkCooldown(name) {
    var response = {};
    response[name] = false;
    var curTime = new Date().getTime();
    if ( typeof(this.cooldowns[name]) !== 'undefined' && curTime < this.cooldowns[name] ) {
      response[name] = true;
      response['cooldown_real'] = (this.cooldowns[name] - curTime) / 1000;
      response['cooldown'] = Math.ceil(response['cooldown_real']);
    }
    return response;
  }

  /**
   * Handle the named cooldown.
   *
   * @param {string} name name of the cooldown
   * @param {numeric} duration duration of the cooldown
   * @return {Object} whether or not to continue the trigger.
   */
  handleCooldown(name, duration) {
    var response = {"continue": false};
    duration = duration * 1000; // convert to milliseconds
    var curTime = new Date().getTime();
    if ( typeof(this.cooldowns[name]) === 'undefined' || curTime >= this.cooldowns[name] ) {
      this.cooldowns[name] = curTime + duration;
      response["continue"] = true;
    }
    return response;
  }

  /**
   * Handle an IF statement
   *
   * @param {array} data line information
   * @return {Object} whether or not to continue the trigger.
   */
  handleIf(data) {
    var result = false;
    var i = 1;
    var skip = 0;
    if (data.length % 2 == 1) {
      skip = parseInt(data[i++]);
    }
    if (data.length > 3) {
      var leftArg = data[i++];
      var comparator = data[i++];
      var rightArg = data[i++];
      result = this.handleComparison(leftArg, comparator, rightArg);
      for (i; i < data.length; i = i + 4) {
        var comparison = data[i].toLowerCase();
        leftArg = data[i+1];
        comparator = data[i+2];
        rightArg = data[i+3];
        var newResult = this.handleComparison(leftArg, comparator, rightArg);
        if (comparison === 'and') {
          result = result && newResult;
        } else if (comparison === 'or') {
          result = result || newResult;
        } else {
          return { continue: false };
        }
      }
    } else {
      var leftArg = data[1];
      var comparator = data[2];
      var rightArg = data[3];
      result = this.handleComparison(leftArg, comparator, rightArg);
    }
    if (skip > 0 && ! result) {
      return { skip: skip };
    } else {
      return { continue: result };
    }
  }

  /**
   * Handle an IF statement
   *
   * @param {string} leftArg left argument
   * @param {string} comparator comparing argument
   * @param {string} rightArg right argument
   * @return {Object} whether or not to continue the trigger.
   */
  handleComparison(leftArg, comparator, rightArg) {
    var result = false;

    if (comparator === '=' || comparator === '==') {
      result = (leftArg == rightArg);
    }
    else if (comparator === '!=') {
      result = (leftArg != rightArg);
    }
    else {
      leftArg = parseFloat(leftArg);
      rightArg = parseFloat(rightArg);
      if (isNaN(leftArg) || isNaN(rightArg)) {
        result = false;
      } else if (comparator === '>=') {
        result = (leftArg >= rightArg);
      } else if (comparator === '<=') {
        result = (leftArg <= rightArg);
      } else if (comparator === '>') {
        result = (leftArg > rightArg);
      } else if (comparator === '<') {
        result = (leftArg < rightArg);
      }
    }

    return result;
  }

  /**
   * Parse the input text into triggers and actions
   * @param {array} data input text to parse
   * @param {boolean} useAsync create an async handler for the triggers
   */
  parseInput(data, useAsync) {
    // Pre Parser when no triggers added
    if (this.triggerCount === 0) {
      for (var handler in this.parsers) {
        this.parsers[handler].preParse();
      }
    }

    var triggerIds = [];
    var currentParser = null;
    var triggerSequence = [];
    data = data.trim();
    var lines = data.split(/\r\n|\n/);

    // Parse all lines
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line.startsWith('#')) {
        var lineData = shlexSplit(line);
        var dataLength = lineData.length;

        // Get new trigger value
        if (dataLength > 0 && !currentParser) {
          currentParser = this.getTrigger(lineData[0]);
          triggerSequence = [lineData];
        }
        // Combine trigger data together
        else if (dataLength > 0 && currentParser) {
          triggerSequence.push(lineData);
        }
        // Clear trigger if found empty line
        else if (dataLength === 0 && currentParser) {
          var parser = this.getParser(currentParser)
          if (parser) {
            parser.addTriggerData(triggerSequence[0][0], triggerSequence[0], this.triggerCount);
            triggerIds.push(this.triggerCount);
            this.triggerData[this.triggerCount] = triggerSequence.slice(1);
            this.triggerCount = this.triggerCount + 1;
          }

          currentParser = null;
          triggerSequence = [];
        }
        // Ensure clear trigger data if no trigger
        else if (!currentParser) {
          triggerSequence = [];
        }
      }
    }
    // Add data if no trailing newline in file
    if (currentParser) {
      var parser = this.getParser(currentParser)
      if (parser) {
        parser.addTriggerData(triggerSequence[0][0], triggerSequence[0], this.triggerCount);
        triggerIds.push(this.triggerCount);
        this.triggerData[this.triggerCount] = triggerSequence.slice(1);
        this.triggerCount = this.triggerCount + 1;
      }
    }

    // Create async for file
    if (useAsync && triggerIds.length > 0) {
      var asyncQueue = async.queue(this.performTrigger.bind(this), 1);
      var asyncId = this.triggerAsync.length;
      this.triggerAsync.push(asyncQueue);
      for(var id = 0; id < triggerIds.length; id++) {
        this.triggerAsyncMap[triggerIds[id]] = asyncId;
      }
    }
  }

  /**
   * Post parse after all triggers read
   */
  doneParsing() {
    for (var handler in this.parsers) {
      this.parsers[handler].postParse();
    }
  }
}
controller = new Controller();
