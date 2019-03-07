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
  VolumeUpRequest: "VU",
  VolumeDownRequest: "VD",
  VolumeResponse: "VOL",
  QueryVolume: "?V",
  QeuryMute: "?M",
  MuteOnOff: "MZ",
  MuteOnRequest: "MO",
  MuteOffRequest: "MF",
  MuteOnResponse: "MUT0",
  MuteOffResponse: "MUT1",
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
    1: {
      id: "HDMI1",
      name: "HDMI 1",
      number: 1,
      type: Characteristic.InputSourceType.HDMI,
      telnetRequestCode: "19FN",
      telnetResponseCode: "FN19"
    },
    2: {
      id: "HDMI2",
      name: "HDMI 2",
      number: 2,
      type: Characteristic.InputSourceType.HDMI,
      telnetRequestCode: "20FN",
      telnetResponseCode: "FN20"
    },
    3: {
      id: "HDMI3",
      name: "HDMI 3",
      number: 3,
      type: Characteristic.InputSourceType.HDMI,
      telnetRequestCode: "21FN",
      telnetResponseCode: "FN21"
    },
    4: {
      id: "HDMI4",
      name: "HDMI 4",
      number: 4,
      type: Characteristic.InputSourceType.HDMI,
      telnetRequestCode: "22FN",
      telnetResponseCode: "FN22"
    },
    5: {
      id: "HDMI5",
      name: "HDMI 5",
      number: 5,
      type: Characteristic.InputSourceType.HDMI,
      telnetRequestCode: "23FN",
      telnetResponseCode: "FN23"
    },
    6: {
      id: "DVD",
      name: "DVD",
      number: 6,
      type: Characteristic.InputSourceType.COMPONENT_VIDEO,
      telnetRequestCode: "04FN",
      telnetResponseCode: "FN04"
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
  this.tvSpeakerService = new Service.TelevisionSpeaker(this.name + ' Volume', 'volumeService');
  this.tvSpeakerService
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
  this.tvSpeakerService
      .getCharacteristic(Characteristic.VolumeSelector)
      .on('set', this.setVolumeSwitch.bind(this));
  this.tvSpeakerService
      .getCharacteristic(Characteristic.Mute)
      .on('get', this.getMuteState.bind(this))
      .on('set', this.setMuteState.bind(this));
  this.tvSpeakerService
      .addCharacteristic(Characteristic.Volume)
      .on('get', this.getVolume.bind(this))
      .on('set', this.setVolume.bind(this));

  this.tvService.addLinkedService(this.tvSpeakerService);
  this.enabledServices.push(this.tvSpeakerService);
  this.enabledServices.push(this.tvService);
}

VSXReceiverAccessory.prototype.getInput = async function(callback) {
  const self = this;
  self.log('Query Input on ' + self.HOST + ':' + self.PORT);

  self.client.write(powerMap.QueryInput + '\r\n');
  
  self.client.on('data', function inputReceive(data) {
    self.log('Input query received data: ' + data);

    var str = data.toString();

    for (var key of Object.keys(inputMap)) { // have to iterate and check using 'includes' because messages can contain garbage data
      if (str.includes(inputMap[key].telnetResponseCode)) {
        self.log("Input is: " + inputMap[key].name + " (" + inputMap[key].number + ")");
        callback(null, inputMap[key].number);
        self.client.removeListener('data', inputReceive);
        return;
      }
    }
    if (str.includes("FN")) { // input message, but unsuppoerted
      callback(null, 0);
      self.client.removeListener('data', inputReceive);
    }
  });
};

VSXReceiverAccessory.prototype.setInput = function(newValue, callback) {
  console.log("input", newValue);
  
  const self = this;

  const message = inputMap[newValue].telnetRequestCode;
  self.log('Setting input to ' + newValue);
  self.client.write(message + '\r\n');
  callback();
};

VSXReceiverAccessory.prototype.setVolumeSwitch = function(down, callback) {  
  const self = this;
  self.log("Volume Switch", down ? "Down" : "Up");

  if (down) {
    self.client.write(volumeMap.VolumeDownRequest + '\r\n');
  }
  
  if (!down) {
    self.client.write(volumeMap.VolumeUpRequest + '\r\n');
  }

  callback();
};

VSXReceiverAccessory.prototype.getMuteState = function(callback) {  
  const self = this;
  self.log('Query Mute Status on ' + self.HOST + ':' + self.PORT);

  self.client.write(powerMap.QueryMute + '\r\n');

  self.client.on('data', function muteReceive(data) {
    self.log('Mute query received data: ' + data);

    var str = data.toString();

    if (str.includes(powerMap.MuteOffResponse)) {
      self.log("Mute is off");
      
      // return true for mute off, false for mute on
      callback(null, true);
      self.client.removeListener('data', muteReceive);
    } else if (str.includes(powerMap.MuteOnResponse)) {
      self.log("Mute is on");
      
      // return true for mute off, false for mute on
      callback(null, false);
      self.client.removeListener('data', muteReceive);
    } else {
      self.log("waiting");
    }
  });
};

VSXReceiverAccessory.prototype.setMuteState = function(off, callback) {
  console.log("setMuteState", off);
  
  const self = this;

  if (off) {
    self.client.write(volumeMap.MuteOffRequest + '\r\n');
  }
  
  if (!off) {
    self.client.write(volumeMap.MuteOnRequest + '\r\n');
  }

  callback();
};

VSXReceiverAccessory.prototype.getVolume = function(newValue, callback) {
  console.log("getVolume", newValue);
  
  const self = this;
  self.log('Query Volume Status on ' + self.HOST + ':' + self.PORT);

  self.client.write(powerMap.QueryVolume + '\r\n');

  self.client.on('data', function volumeReceive(data) {
    self.log('Volume query received data: ' + data);

    var str = data.toString();

    if (str.includes(powerMap.VolumeResponse)) {
      // extract just the data we need and convert to int
      var volume = parseInt(str.replace(powerMap.VolumeResponse, ""));

      if (!isNaN(volume)) {
        self.log("VSX Reported Volume " + volume);      
        callback(null, volume);
        self.client.removeListener('data', volumeReceive);
      }
    } else {
      self.log("waiting");
    }
  });

};

VSXReceiverAccessory.prototype.setVolume = function(newValue, callback) {
  console.log("setVolume", newValue);
  
  const self = this;

  callback("not implemented");
};

VSXReceiverAccessory.prototype.getPowerState = function(callback) {
  const self = this;
  self.log('Query Power Status on ' + self.HOST + ':' + self.PORT);

  self.client.write(powerMap.QueryPower + '\r\n');

  self.client.on('data', function powerReceive(data) {
    self.log('Power query received data: ' + data);

    var str = data.toString();

    if (str.includes(powerMap.PowerOffResponse)) {
      self.log("Power is Off");
      
      callback(null, false);
      self.client.removeListener('data', powerReceive);

    } else if (str.includes(powerMap.PowerOnResponse)) {
      self.log("Power is On");
      
      callback(null, true);
      self.client.removeListener('data', powerReceive);
    } else {
      self.log("waiting");
    }
  });
};

VSXReceiverAccessory.prototype.setPowerState = function(on, callback) {
  const self = this;

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
