/*
* IoT Hub Raspberry Pi NodeJS - Microsoft Sample Code - Copyright (c) 2017 - Licensed MIT
*/
'use strict';

var piface = {};

try {
  piface = require('piface-node-12');
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

// DPS and connection stuff

const iotHubTransport = require('azure-iot-device-mqtt').Mqtt;

var ProvisioningTransport = require('azure-iot-provisioning-device-mqtt').Mqtt;
var SymmetricKeySecurityClient = require('azure-iot-security-symmetric-key').SymmetricKeySecurityClient;
var ProvisioningDeviceClient = require('azure-iot-provisioning-device').ProvisioningDeviceClient;

var provisioningHost = 'global.azure-devices-provisioning.net';

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
const BASE_INPUT = 1;
const BUTTON_COUNT = 4;

const OUTPUT_COUNT = 8;
const BASE_OUTPUT = 1;

var client;
var config;
var connect;

var sendingMessage = true;

var fauxInputs = [0, 0, 0, 0, 0, 0, 0, 0];
var lastInputs = [undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined];

function updateInputStatus(telemetry) {
  if (!sendingMessage) { return; }

  var rawMessage = JSON.stringify(telemetry);

  var message = new Message(rawMessage);

  if (config.infoOutboundMessages)
    console.info('Sending Input Status Update to Azure IoT Hub');

  if (config.debugOutboundMessages)
    console.debug(rawMessage);

  client.sendEvent(message, (err) => {
    if (err) {
      console.error('Failed to send message to Azure IoT Hub');
    } else {
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

  if (pin !== undefined && pin >= BASE_OUTPUT && pin <= OUTPUT_COUNT) {
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
    response.send(400, 'Invalid pin : must be between 1 and 8', function (err) {
      if (err) {
        console.error('Unable to respond to SetOutput method request');
      }
    });
  }
}

function readAllInputs() {
  var inputs = [];

  var input;

  for (input = BASE_INPUT; input <= INPUT_COUNT; input++) {
    var state = piface.digital_read(input-1);

    inputs[input-1] = state;
  }

  return inputs;
}

function onPulseOutput(request, response) {
  sendingMessage = true;

  var pin = request.payload.pin;
  var duration = request.payload.duration;

  if (config.infoMethods)
    console.info("PulseOutput : pin = " + pin + " duration " + duration);

  if (pin !== undefined && pin >= BASE_OUTPUT && pin <= OUTPUT_COUNT) {
    pulseOutput(pin, duration);

    response.send(200, 'Successfully pulsed output ' + pin, function (err) {
      if (err) {
        console.error('Unable to respond to PulseOutput method request');
      }
    });
  }
  else {
    response.send(400, 'Invalid pin : must be between 1 and 8', function (err) {
      if (err) {
        console.error('Unable to respond to PulseOutput method request');
      }
    });
  }
}

function onBlinkOutput(request, response) {
  sendingMessage = true;

  var pin = request.payload.pin;
  var duration = request.payload.duration;
  var count = request.payload.count;

  if (config.infoMethods)
    console.info("BlinkOutput : pin = " + pin + " duration " + duration + " count " + count);

  if (pin !== undefined && pin >= BASE_OUTPUT && pin <= OUTPUT_COUNT) {
    blinkOutput(pin, duration, count);

    response.send(200, 'Successfully blinked Output ' + pin, function (err) {
      if (err) {
        console.error('Unable to respond to BlinkOutput method request');
      }
    });
  }
  else {
    response.send(400, 'Invalid pin : must be between 1 and 8', function (err) {
      if (err) {
        console.error('Unable to respond to BlinkOutput method request');
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


function blinkOutput(pin, duration, count) {

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
  piface.digital_write(pin-1, state);
}

function initBindings() {
    // set C2D callback
    client.onDeviceMethod('start', onStart);
    client.onDeviceMethod('stop', onStop);

    client.on('message', onReceiveMessage);

    // Init device methods

    client.onDeviceMethod('SetOutput', onSetOutput);
    client.onDeviceMethod('PulseOutput', onPulseOutput);
    client.onDeviceMethod('BlinkOutput', onBlinkOutput);
}

function initLogic() {
    // Setup input polling

    setInterval(() => {

        var changed = false;

        var inputs = readAllInputs();

        var telemetry = {};

        var input;

        for (input = BASE_INPUT; input <= INPUT_COUNT; input++) {
          if(lastInputs[input-1] == undefined) {
              telemetry["input" + input] = inputs[input-1].toString();
              lastInputs[input-1] = inputs[input-1];
              changed = true;
          }
          else {
              if(lastInputs[input-1] !== inputs[input-1]) {
                  lastInputs[input-1] = inputs[input-1];

                  changed = true;

                  telemetry["input" + input] = inputs[input-1].toString();

                  if(input <= BUTTON_COUNT) {
                      if(inputs[input-1] === 0) {
                          telemetry["button" + input + "released"] = "Released";
                      }
                      else {
                          telemetry["button" + input + "pressed"] = "Pressed";
                      }
                  }
              }
          }
        }

        if(changed) {
            updateInputStatus(telemetry);
        }
      }, config.interval);
}


function initDevice() {
    // set up wiring

    piface.init();
}

function initClient() {

	// Start the device (connect it to Azure IoT Central).
	try {
		var provisioningSecurityClient = new SymmetricKeySecurityClient(connect.deviceId, connect.symmetricKey);
		var provisioningClient = ProvisioningDeviceClient.create(provisioningHost, connect.idScope, new ProvisioningTransport(), provisioningSecurityClient);

		provisioningClient.register((err, result) => {
			if (err) {
				console.log('error registering device: ' + err);
			} else {
				console.log('registration succeeded');
				console.log('assigned hub=' + result.assignedHub);
				console.log('deviceId=' + result.deviceId);

				var connectionString = 'HostName=' + result.assignedHub + ';DeviceId=' + result.deviceId + ';SharedAccessKey=' + connect.symmetricKey;
				client = Client.fromConnectionString(connectionString, iotHubTransport);
			
				client.open((err) => {
					if (err) {
						console.error('[IoT hub Client] Connect error: ' + err.message);
						return;
					}
					else {
						console.log('[IoT hub Client] Connected Successfully');
					}
			
					initBindings();

					initLogic();
				});
			}
		});
	}
	catch(err) {
		console.log(err);
	}
}

// Read in configuration from config.json

try {
	config = require('./config.json');
} catch (err) {
	config = {};
	console.error('Failed to load config.json: ' + err.message);
	return;
}

// Read in connection details from connect.json

try {
	connect = require('./connect.json');
} catch (err) {
	connect = {};
	console.error('Failed to load connect.json: ' + err.message);
	return;
}

// Perform any device initialization

initDevice();

// Initialize Azure IoT Client

initClient();
