var Service, Characteristic, inputMap, reverseInputMap, client;
var net = require("net");

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory(
    "homebridge-vsx-receiver",
    "VSX-Receiver",
    VSXReceiverAccessory
  );
};

const volumeMap = {
  VolumeUp: "VU",
  VolumeDown: "VD",
  QueryVolume: "?V",
  MuteOnOff: "MZ"
};

const powerMap = {
  PowerOffRequest: "PF",
  PowerOnRequest: "PO",
  PowerOffResponse: "PWR1",
  PowerOnResponse: "PWR0",
  QueryPower: "?P",
  QueryInput: "?F"
}

function VSXReceiverAccessory(log, config) {
  this.log = log;
  this.name = config.name;
  this.HOST = config.ip;
  this.PORT = config.port;

  this.enabledServices = [];

  this.isOn = false;

  // setup client because VSX receivers only support one connection
  this.client = new net.Socket();
  var self = this;
  this.client.on('error', function (ex) {
    self.log("Received an error while communicating" + ex);
  });
  this.client.connect(self.PORT, self.HOST, function () {
    self.log("Connected to " + self.name);
  });

  // setup inputMap here because Characteristic is now defined
  inputMap = {
    DVD: {
      id: "DVD",
      name: "DVD",
      number: 6,
      type: Characteristic.InputSourceType.COMPONENT_VIDEO,
      telnetCode: "04FN"
    },
    HDMI1: {
      id: "HDMI1",
      name: "HDMI 1",
      number: 1,
      type: Characteristic.InputSourceType.HDMI,
      telnetCode: "19FN"
    },
    HDMI2: {
      id: "HDMI2",
      name: "HDMI 2",
      number: 2,
      type: Characteristic.InputSourceType.HDMI,
      telnetCode: "20FN"
    },
    HDMI3: {
      id: "HDMI3",
      name: "HDMI 3",
      number: 3,
      type: Characteristic.InputSourceType.HDMI,
      telnetCode: "21FN"
    },
    HDMI4: {
      id: "HDMI4",
      name: "HDMI 4",
      number: 4,
      type: Characteristic.InputSourceType.HDMI,
      telnetCode: "22FN"
    },
    HDMI5: {
      id: "HDMI5",
      name: "HDMI 5",
      number: 5,
      type: Characteristic.InputSourceType.HDMI,
      telnetCode: "23FN"
    }
  };

  this.tvService = new Service.Television(this.name, "Television");

  this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);

  this.tvService.setCharacteristic(
    Characteristic.SleepDiscoveryMode,
    Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE
  );
  this.tvService
    .getCharacteristic(Characteristic.Active)
    .on("set", this.setPowerState.bind(this))
    .on("get", this.getPowerState.bind(this));
  this.tvService.setCharacteristic(Characteristic.ActiveIdentifier, 1);

  this.tvService
    .getCharacteristic(Characteristic.ActiveIdentifier)
    .on("set", this.setInput.bind(this))
    .on("get", this.getInput.bind(this));

  // setup inputs
  for (var key of Object.keys(inputMap)) {
    var inputService = createInputSource(inputMap[key].id, inputMap[key].name, inputMap[key].number);
    this.tvService.addLinkedService(inputService);
    this.enabledServices.push(inputService);
    // setup reverseInputMap for receiving input queries
  }

  // setup volume control
  this.speakerService = new Service.TelevisionSpeaker(
    this.name + " Volume",
    "volumeService"
  );

  this.speakerService
    .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
    .setCharacteristic(
      Characteristic.VolumeControlType,
      Characteristic.VolumeControlType.RELATIVE_WITH_CURRENT
    );

  this.speakerService
    .getCharacteristic(Characteristic.VolumeSelector)
    .on("set", this.setVolume.bind(this));

  this.tvService.addLinkedService(this.speakerService);

  this.enabledServices.push(this.tvService);
  this.enabledServices.push(this.speakerService);
}

VSXReceiverAccessory.prototype.setVolume = function(newValue, callback) {
  console.log("volume", newValue);
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


VSXReceiverAccessory.prototype.getInput = async function(callback) {
  const self= this;
  self.log('Query Input on ' + self.HOST + ':' + self.PORT);

  self.client.write(powerMap.QueryInput + '\r\n');
  
  self.client.on('data', function inputReceive(data) {
    self.log('Input query received data: ' + data);

    var str = data.toString();

    for (var key of Object.keys(inputMap)) { // have to iterate and check using 'includes' because messages can contain garbage data
      if (str.includes(inputMap[key].telnetCode)) {
        self.log("Input is: " + inputMap[key].name + " (" + inputMap[key].number + ")");
        callback(null, inputMap[key].number);
        self.client.removeListener('data', inputReceive);
        self.log(self.client.listeners('data'));
      }
    }
    callback(null, 0);
  });
};

VSXReceiverAccessory.prototype.setInput = function(newValue, callback) {
  console.log("input", newValue);
  
  const self= this;

  const message = inputMap[newValue].telnetCode;
  self.client.connect(self.PORT, self.HOST, function () {
    self.log('Setting input to ' + newValue);
    self.client.write(message + '\r\n');
  });
  callback();
};

VSXReceiverAccessory.prototype.setVolume = function(newValue, callback) {
  console.log("input", newValue);
  
  const self= this;

  const message = inputMap[newValue].telnetCode;
  self.client.connect(self.PORT, self.HOST, function () {
    self.log('Setting input to ' + newValue);
    self.client.write(message + '\r\n');
  });
  callback();
};

VSXReceiverAccessory.prototype.getPowerState = function(callback) {
  const self= this;
  self.log('Query Power Status on ' + self.HOST + ':' + self.PORT);

  self.client.write(powerMap.QueryPower + '\r\n');

  self.client.on('data', function powerReceive(data) {
    self.log('Power query received data: ' + data);

    var str = data.toString();

    if (str.includes(powerMap.PowerOffResponse)) {
      self.log("Power is Off");
      
      callback(null, false);
      self.client.removeListener('data', powerReceive);
      self.log(self.client.listeners('data'));

    } else if (str.includes(powerMap.PowerOnResponse)) {
      self.log("Power is On");
      
      callback(null, true);
      self.client.removeListener('data', powerReceive);
      self.log(self.client.listeners('data'));

    } else {
      self.log("waiting");
    }
  });
};

VSXReceiverAccessory.prototype.setPowerState = function(on, callback) {
  if (on) {
    self.client.write(powerMap.PowerOnRequest + '\r\n');
  }

  if (!on) {
    self.client.write(powerMap.PowerOffRequest + '\r\n');
  }
  callback();
};

VSXReceiverAccessory.prototype.getServices = function() {
  return this.enabledServices;
};

function createInputSource(
  id,
  name,
  number,
  type = Characteristic.InputSourceType.HDMI
) {
  var input = new Service.InputSource(id, name);
  input
    .setCharacteristic(Characteristic.Identifier, number)
    .setCharacteristic(Characteristic.ConfiguredName, name)
    .setCharacteristic(
      Characteristic.IsConfigured,
      Characteristic.IsConfigured.CONFIGURED
    )
    .setCharacteristic(Characteristic.InputSourceType, type);
  return input;
}
