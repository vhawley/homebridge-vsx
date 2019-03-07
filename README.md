# Homebridge plugin for VSX Receivers

### !🚧 This is work in progress 🚧!


## Requirements

1. iOS 12.2 beta
2. Homebridge v0.4.46 or newer

## Installation

1. npm install -g homebridge-vsx-receiver
2. Update your configuration file. See below for a sample.

## Configuration

Enter the IP address of your receiver in the ip field.
Default port is 23.  Only use something different if you are sure you changed your receiver's port.

Configuration sample:

 ```
"accessories": [
    {
        "accessory": "VSX",
        "name": "VSX-45",
        "description": "Receiver",
        "ip": "192.168.134.20",
        "port": 23
    }
]
```
