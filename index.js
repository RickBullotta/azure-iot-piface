/*
* IoT Hub Raspberry Pi NodeJS - Microsoft Sample Code - Copyright (c) 2017 - Licensed MIT
*/
'use strict';

const fs = require('fs');
const path = require('path');

var piface = {};

try {
  piface = require('piface');
}
catch(e) {
  piface.init = function() {};
  piface.digital_read = function(input) {
    return fauxInputs[input];
  };
  piface.digital_write = function(output,state) {
    fauxInputs[output] = state;
  }
}

const Client = require('azure-iot-device').Client;
const ConnectionString = require('azure-iot-device').ConnectionString;
const Message = require('azure-iot-device').Message;
const Protocol = require('azure-iot-device-mqtt').Mqtt;

const keypress = require('keypress');

// make `process.stdin` begin emitting "keypress" events
keypress(process.stdin);

// listen for the "keypress" event
process.stdin.on('keypress', function (ch, key) {
  console.log('got "keypress"', key.ctrl + ' ' + key.name + ' ' + key.ch);
  if (key && key.ctrl && key.name == 'c') {
    process.exit();
  }
});

process.stdin.setRawMode(true);
process.stdin.resume();

const INPUT_COUNT = 8;
const BASE_INPUT = 0;

const OUTPUT_COUNT = 8;
const BASE_OUTPUT = 0;

var messageId = 0;
var deviceId;
var client
var config;

var sendingMessage = true;

var lastInputs = [0, 0, 0, 0, 0, 0, 0, 0];
var fauxInputs = [0, 0, 0, 0, 0, 0, 0, 0];

function updateInputStatus(inputs) {
  if (!sendingMessage) { return; }

  var content = {
    messageId: ++messageId,
    deviceId: deviceId
  };

  var rawMessage = JSON.stringify(inputs);

  console.log("Sending:");
  console.log(rawMessage);

  var message = new Message(rawMessage);

  if (config.infoOutboundMessages)
    console.info('Sending Input Status Update to Azure IoT Hub');

  if (config.debugOutboundMessages)
    console.debug(rawMessage);

  client.sendEvent(message, (err) => {
    if (err) {
      console.error('Failed to send message to Azure IoT Hub');
    } else {
      pulseOutput(3, 100);

      if (config.infoOutboundMessages)
        console.info('Message sent to Azure IoT Hub');
    }
  });
}

function onSetOutput(request, response) {
  sendingMessage = true;

  var pin = request.payload.pin;
  var state = request.payload.state;

  if (config.infoMethods)
    console.info("SetOutput : pin = " + pin + " state " + state);

  if (pin !== undefined && pin >= BASE_OUTPUT && pin < OUTPUT_COUNT) {
    var digitalState = 1;

    if (state == false || state == 0)
      digitalState = 0;

    setOutput(pin, digitalState);

    response.send(200, 'Successfully set output ' + pin + ' to ' + digitalState, function (err) {
      if (err) {
        console.error('Unable to respond to SetOutput method request');
      }
    });
  }
  else {
    response.send(400, 'Invalid pin : must be between 0 and 7', function (err) {
      if (err) {
        console.error('Unable to respond to SetOutput method request');
      }
    });
  }
}

function readAllInputs() {
  var inputs = [];

  var input;

  for (input = BASE_INPUT; input < INPUT_COUNT; input++) {
    var state = piface.digital_read(input);

    inputs[input] = state;
  }

  return inputs;
}

function onReadInput(request, response) {
  sendingMessage = true;

  var pin = request.payload.pin;

  if (config.infoMethods)
    console.info("ReadInput : pin = " + pin);

  if (pin !== undefined && pin >= BASE_INPUT && pin < INPUT_COUNT) {
    var state = piface.digital_read(pin);

    var payload = { "state": state };

    var rawMessage = JSON.stringify(payload);

    if (config.debugMethods)
      console.debug(rawMessage);

    response.send(200, rawMessage, function (err) {
      if (err) {
        console.error('Unable to respond to ReadInput method request');
      }
    });
  }
  else {
    response.send(400, 'Invalid pin : must be between 0 and 7', function (err) {
      if (err) {
        console.error('Unable to respond to ReadInput method request');
      }
    });
  }
}

function onPulseOutput(request, response) {
  sendingMessage = true;

  var pin = request.payload.pin;
  var duration = request.payload.duration;

  if (config.infoMethods)
    console.info("PulseOutput : pin = " + pin + " duration " + duration);

  if (pin !== undefined && pin >= BASE_OUTPUT && pin < OUTPUT_COUNT) {
    pulseOutput(pin, duration);

    response.send(200, 'Successfully pulsed output ' + pin, function (err) {
      if (err) {
        console.error('Unable to respond to PulseOutput method request');
      }
    });
  }
  else {
    response.send(400, 'Invalid pin : must be between 0 and 7', function (err) {
      if (err) {
        console.error('Unable to respond to PulseOutput method request');
      }
    });
  }
}

function onBlinkLED(request, response) {
  sendingMessage = true;

  var pin = request.payload.pin;
  var duration = request.payload.duration;
  var count = request.payload.count;

  if (config.infoMethods)
    console.info("BlinkLED : pin = " + pin + " duration " + duration + " count " + count);

  if (pin !== undefined && pin >= BASE_OUTPUT && pin < OUTPUT_COUNT) {
    blinkLED(pin, duration, count);

    response.send(200, 'Successfully blinked LED ' + pin, function (err) {
      if (err) {
        console.error('Unable to respond to BlinkLED method request');
      }
    });
  }
  else {
    response.send(400, 'Invalid pin : must be between 0 and 7', function (err) {
      if (err) {
        console.error('Unable to respond to BlinkLED method request');
      }
    });
  }
}

function onStart(request, response) {
  if (config.infoMethods)
    console.info('Try to invoke method start(' + request.payload || '' + ')');

  sendingMessage = true;

  response.send(200, 'Successully start sending message to cloud', function (err) {
    if (err) {
      console.error('[IoT hub Client] Failed sending a method response:\n' + err.message);
    }
  });
}

function onStop(request, response) {
  if (config.infoMethods)
    console.info('Try to invoke method stop(' + request.payload || '' + ')')

  sendingMessage = false;

  response.send(200, 'Successully stop sending message to cloud', function (err) {
    if (err) {
      console.error('[IoT hub Client] Failed sending a method response:\n' + err.message);
    }
  });
}

function onReceiveMessage(msg) {
  var message = msg.getData().toString('utf-8');

  client.complete(msg, () => {
    if (config.infoInboundMessages)
      console.info('Incoming Message Received');

    if (config.debugInboundMessages)
      console.debug(message);
  });
}


function blinkLED(pin, duration, count) {

  if (duration == undefined || isNaN(duration) || duration < 0 || duration > 60000)
    duration = 500;

  if (count == undefined || isNaN(count) || count < 0 || count > 60)
    count = 1;

  var currentCount = 0;

  var intervalID = setInterval(function () {
    pulseOutput(pin, duration);

    ++currentCount;

    if (currentCount >= count)
      clearInterval(intervalID);
  }, 2 * duration);
}


function pulseOutput(pin, duration) {
  if (duration == undefined || isNaN(duration) || duration < 0 || duration > 60000)
    duration = 500;

  setOutput(pin, 1);

  setTimeout(function () {
    setOutput(pin, 0);
  }, duration);
}

function setOutput(pin, state) {
  piface.digital_write(pin, state);
}

function initClient(connectionStringParam, credentialPath) {
  var connectionString = ConnectionString.parse(connectionStringParam);
  deviceId = connectionString.DeviceId;

  // fromConnectionString must specify a transport constructor, coming from any transport package.
  client = Client.fromConnectionString(connectionStringParam, Protocol);

  // Configure the client to use X509 authentication if required by the connection string.
  if (connectionString.x509) {
    // Read X.509 certificate and private key.
    // These files should be in the current folder and use the following naming convention:
    // [device name]-cert.pem and [device name]-key.pem, example: myraspberrypi-cert.pem
    var connectionOptions = {
      cert: fs.readFileSync(path.join(credentialPath, deviceId + '-cert.pem')).toString(),
      key: fs.readFileSync(path.join(credentialPath, deviceId + '-key.pem')).toString()
    };

    client.setOptions(connectionOptions);

    console.log('[Device] Using X.509 client certificate authentication');
  }
  return client;
}

(function (connectionString) {
  // read in configuration in config.json
  try {
    config = require('./config.json');
  } catch (err) {
    console.error('Failed to load config.json: ' + err.message);
    return;
  }

  // set up wiring
  piface.init();

  // create a client
  // read out the connectionString from process environment
  connectionString = connectionString || process.env['AzureIoTHubDeviceConnectionString'];
  client = initClient(connectionString, config);

  client.open((err) => {
    if (err) {
      console.error('[IoT hub Client] Connect error: ' + err.message);
      return;
    }
    else {
      console.log('[IoT hub Client] Connected Successfully');
    }

    // set C2D and device method callback
    client.onDeviceMethod('start', onStart);
    client.onDeviceMethod('stop', onStop);

    client.onDeviceMethod('SetOutput', onSetOutput);
    client.onDeviceMethod('PulseOutput', onPulseOutput);
    client.onDeviceMethod('BlinkLED', onBlinkLED);
    client.onDeviceMethod('ReadInput', onReadInput);

    client.on('message', onReceiveMessage);

    setInterval(() => {
      if (config.infoConfigurationSync)
        console.info("Syncing Device Twin...");

      client.getTwin((err, twin) => {
        if (err) {
          console.error("Get twin message error : " + err);
          return;
        }

        if (config.debugConfigurationSync) {
          console.debug("Desired:");
          console.debug(JSON.stringify(twin.properties.desired));
          console.debug("Reported:");
          console.debug(JSON.stringify(twin.properties.reported));
        }

        var inputs = readAllInputs();

        var hadChange = false;

        var twinUpdate = {};

        twinUpdate["inputs"] = {};

        var input;

        var changedInputs = {};

        for (input = BASE_INPUT; input < INPUT_COUNT; input++) {
          if (inputs[input] != lastInputs[input]) {
            hadChange = true;

            console.log("Input " + input + " changed to " + inputs[input]);

            changedInputs["button" + input] = inputs[input];

            if(inputs[input] > 0)
              changedInputs["button" + input + "pressed"] = inputs[input].toString();
            else
              changedInputs["button" + input + "released"] = inputs[input].toString();

            twinUpdate["inputs"]["input" + input] = inputs[input];
          }
        }

        if (hadChange) {
          // Report current state of the inputs as a device -> cloud message

          updateInputStatus(changedInputs);

          // Update the device twin if configured to do so

          if (config.reportInputsToDeviceTwin) {
            twin.properties.reported.update(twinUpdate, function (err) {
              if (err) {
                console.error("Unable To Update Device Twin : " + err)
              }
              console.log("Device Twin Updated");
            });
          }

        }

        lastInputs = inputs;

      });
    }, config.interval);

  });
})(process.argv[2]);
