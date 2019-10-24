---
services: iot-hub, iot-central
platforms: Nodejs
author: rickb
---

# Azure IoT Hub/IoT Central Raspberry Pi "PiFace" Digital I/O Interface

This utilizes the Azure IoT Node.js SDK to connect to a PiFace Digital 2 board on a Raspberry Pi. This connector provides the ability to read the state of the 8 inputs (including 4 push buttons) and to set the state of 8 outputs (including 4 relays)

# How To Configure This Device Connector

In a connect.json file, you'll need to provide the idScope, deviceId, and connection key that are displayed when you select "Connect" from the device view inside of IoT Central

{
    "idScope" : "0ne00000000",
    "deviceId" : "MyPiface",
    "symmetricKey" : "z11uz4E35gO0Z9uI0PYcVm/twUyAm/iJovuMk8A2xpo=",
}

# How To Run This Device Connector 

Launch index.js to execute this connector.

# Features

This connector exposes 8 events (button1pressed,button1released...button4pressed, button4released), 8 states (input1...input8) and a device method used to setting the output(s) to a desired state (on or off).