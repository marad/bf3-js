var net = require('net');
var proto = require('./bfpacket');
var parse = require('shell-quote').parse;

function ArrayTokenizer(array) {
  var self = this;
  this.array = array;
  this.position = 0;

  this.nextToken = function() {
    var index = this.position;
    this.position += 1;
    return this.array[index];
  }

  this.hasNext = function() {
    return (this.position < this.array.length);
  }
}

function Reader() {
  var self = this;

  this.commands = [];
  this.returnSingleValue = false;

  this.skip = function(countArg) {
    var count = countArg || 1;
    self.commands.push(function(tokenizer, object) {
      for(var i=0; i < count; i++) {
        tokenizer.nextToken();
      }
    });
    return self;
  };

  this.singleString = function() {
    self.string("singleValue");
    self.returnSingleValue = true;
    return self;
  }

  this.singleInteger = function() {
    self.integer("singleValue");
    self.returnSingleValue = true;
    return self;
  }

  this.string = function(name) {
    self.commands.push(function(tokenizer, object) {
      var token = tokenizer.nextToken();
      if (token) {
        object[name] = token.toString();
      }
    });
    return self;
  };

  this.integer = function(name) {
    self.commands.push(function(tokenizer, object) {
      var token = tokenizer.nextToken();
      if (token) {
        object[name] = parseInt(token);
      }
    });
    return self;
  };

  this.bool = function(name) {
    self.commands.push(function(tokenizer, object) {
      var stringValue = tokenizer.nextToken();
      if (stringValue) {
        object[name] = stringValue == "true" ? true : false;
      }
    });
    return self;
  };

  this.reader = function(name, reader) {
    self.commands.push(function(tokenizer, object) {
      if (reader) {
        object[name] = reader.readFromTokenizer(tokenizer);
      }
    });
    return self;
  };

  this.array = function(name, type, length) {
    self.commands.push(function(tokenizer, object) {
      var loopCondition = null;
      if (length) {
        if (typeof length === "string") {
          loopCondition = function(i) { return i < object[length]; };
        } else if (typeof length === "function")  {
          loopCondition = function(i) { return i < length(); };
        }
      }
      else {
        loopCondition = function(i) { return tokenizer.hasNext(); };
      }

      var result = [];
      for(var i=0; loopCondition(i); i++) {
        var value = null;
        if (typeof type === "string") {
          value = tokenizer.nextToken();
          if (type === 'integer') {
            value = parseInt(value);
          } else if (type === 'string') {
            value = value.toString();
          }
        } else if(typeof type === "object" && type.readFromTokenizer) {
          value = type.readFromTokenizer(tokenizer);
        }

        if (value !== null) {
          result.push(value);
        }
      }

      object[name] = result;

    });
    return self;
  };


  this.invokeCommands = function(tokenizer, object) {
    self.commands.forEach(function(command) {
      command(tokenizer, object);
    });
  };

  this.readFromTokenizer = function(tokenizer) {
    var object = {};
    self.invokeCommands(tokenizer, object);
    return object;
  }

  this.read = function(wordArray) {
    var tokenizer = new ArrayTokenizer(wordArray);
    var result = self.readFromTokenizer(tokenizer);
    if (self.returnSingleValue) {
      result = result["singleValue"];
    }
    return result;
  };
}

var statusReader = new Reader().singleString();

var teamScoresReader = new Reader()
  .integer("count")
  .array("scores", "integer", "count")
  .integer("targetScore");


var serverInfoReader = new Reader()
  .string("status")
  .string("serverName")
  .integer("playerCount")
  .integer("maxPlayerCount")
  .string("currentGameMode")
  .string("currentMap")
  .integer("roundsPlayed")
  .integer("roundsTotal")
  .reader("scores", teamScoresReader)
  .string("onlineState")
  .bool("ranked")
  .bool("punkBuster")
  .bool("hasGamePassword")
  .integer("serverUptime")
  .integer("roundTime");


var mapDescription = new Reader().string("code").string("mode").integer("rounds");

var mapListReader = new Reader()
  .string("status").integer("mapCount")
  .skip() // wordsPerMap
  .array("maps", mapDescription, "mapCount");

var playerInfoReader = new Reader()
  .string("name").string("guid").integer("teamId")
  .integer("squadId").integer("kills").integer("deaths")
  .integer("score").skip();

var playerListInfoReader = new Reader()
  .string("status")
  .skip(9) // numberOfParameters + parameterNames
  .integer("playerCount")
  .array("players", playerInfoReader, "playerCount");

var banInfoReader = new Reader().skip().string("name").string("type").integer("value").integer("unknown").string("reason");
var banInfoListReader = new Reader().string("status").array("bans", banInfoReader);

var serverEventReader = new Reader().string("name").array("args", "string");

var GAME_MODES = {
  "TeamDeathMatch0": "TDM",
  "ConquestLarge0": "Conquest Large",
  "ConquestSmall0": "Conquest Small",
  "RushLarge0": "Rush Large",
  "RushSmall0": "Rush Small"
};

var READERS = {
  //
  // COMMAND RESPONSES
  //
  "login.plainText": statusReader,
  "version": new Reader().string("status").string("game").integer("version"),
  "admin.eventsEnabled": new Reader().string("status").bool("enabled"),
  "admin.password": new Reader().string("status").string("password"),
  "admin.help": new Reader().string("status").array("commands", "string"),
  "punkBuster.isActive": new Reader().string("status").bool("active"),
  "punkBuster.activate": statusReader,
  //"punktBuster.pb_sv_command":
  "serverInfo": serverInfoReader,
  "admin.say": statusReader,
  "admin.kickPlayer": statusReader,
  "listPlayers": playerListInfoReader,
  "admin.listPlayers": playerListInfoReader,
  "admin.movePlayer": statusReader,
  "admin.killPlayer": statusReader,
  "banList.load": statusReader,
  "banList.save": statusReader,
  "banList.add": statusReader,
  "banList.remove": statusReader,
  "banList.clear": statusReader,
  "banList.list": banInfoListReader,
  "mapList.load": statusReader,
  "mapList.save": statusReader,
  "mapList.add": statusReader,
  "mapList.remove": statusReader,
  "mapList.clear": statusReader,
  "mapList.list": mapListReader,
  "mapList.setNextMapIndex": statusReader,
  "mapList.getMapIndices": new Reader().string("status").integer("current").integer("next"),
  "mapList.getRounds": new Reader().string("status").integer("current").integer("total"),
  "mapList.runNextRound": statusReader,
  "mapList.restartRound": statusReader,
  "mapList.endRound": statusReader,
  //"mapList.availableMaps": - broken?
  "vars.ranked": new Reader().string("status").bool("ranked"),
  "vars.serverName": new Reader().string("status").string("serverName"),
  "vars.gamePassword": new Reader().string("status").string("password"),
  "vars.autoBalance": new Reader().string("status").bool("autoBalance"),
  "vars.friendlyFire": new Reader().string("status").bool("friendlyFire"),
  "vars.maxPlayers": new Reader().string("status").integer("maxPlayers"),
  "vars.killCam": new Reader().string("status").bool("killCam"),
  "vars.miniMap": new Reader().string("status").bool("miniMap"),
  "vars.hud": new Reader().string("status").bool("hud"),
  "vars.crossHair": new Reader().string("status").bool("crossHair"),
  "vars.3dSpotting": new Reader().string("status").bool("3dSpotting"),
  "vars.miniMapSpotting": new Reader().string("status").bool("miniMapSpotting"),
  "vars.nameTag": new Reader().string("status").bool("nameTag"),
  "vars.3pCam": new Reader().string("status").bool("3pCam"),
  "vars.regenerateHealth": new Reader().string("status").bool("regenerateHealth"),
  "vars.teamKillCountForKick": new Reader().string("status").integer("teamKillCountForKick"),
  "vars.teamKillValueForKick": new Reader().string("status").integer("teamKillValueForKick"),
  "vars.teamKillValueIncrease": new Reader().string("status").integer("teamKillValueIncrease"),
  "vars.teamKillValueDecreasePerSecond": new Reader().string("status").integer("teamKillValueDecreasePerSecond"),
  "vars.teamKillKickForBan": new Reader().string("status").integer("teamKillKickForBan"),
  "vars.idleTimeout": new Reader().string("status").integer("idleTimeout"),
  "vars.idleBanRounds": new Reader().string("status").integer("idleBanRounds"),
  "vars.roundStartPlayerCount": new Reader().string("status").integer("roundStartPlayerCount"),
  "vars.roundRestartPlayerCount": new Reader().string("status").integer("roundRestartPlayerCount"),
  "vars.vehicleSpawnAllowed": new Reader().string("status").bool("vehicleSpawnAllowed"),
  "vars.vehicleSpawnDelay": new Reader().string("status").integer("vehicleSpawnDelay"),
  "vars.soldierHealth": new Reader().string("status").integer("soldierHealth"),
  "vars.playerRespawnTime": new Reader().string("status").integer("playerRespawnTime"),
  "vars.playerManDownTime": new Reader().string("status").integer("playerManDownTime"),
  "vars.bulletDamage": new Reader().string("status").integer("bulletDamage"),
  "vars.gameModeCounter": new Reader().string("status").integer("gameModeCounter"),
  "vars.onlySquadLeaderSpawn": new Reader().string("status").integer("onlySquadLeaderSpawn"),
  "vars.unlockMode": new Reader().string("status").string("unlockMode"),
  //
  // EVENTS
  //
  "player.onAuthenticated": new Reader().string("eventName").string("soldierName"),
  "player.onJoin": new Reader().string("eventName").string("soldierName").string("guid"),
  "player.onLeave": new Reader().string("eventName").string("soldierName").reader("playerInfo", playerInfoReader),
  "player.onSpawn": new Reader().string("eventName").string("soldierName").integer("teamId"),
  "player.onKill": new Reader().string("eventName").string("killerName").string("killedName").string("weapon").bool("headshot"),
  "player.onChat": new Reader().string("eventName").string("soldierName").string("message"),
  "player.onSquadChange": new Reader().string("eventName").string("soldierName").integer("teamId").integer("squadId"),
  "player.onTeamChange": new Reader().string("eventName").string("soldierName").integer("teamId").integer("squadId"),
  "punkBuster.onMessage": new Reader().string("eventName").string("message"),
  "server.onLevelLoaded": new Reader().string("eventName").string("levelName").string("gameMode").integer("roundsPlayed").integer("roundsTotal"),
  "server.onRoundOver": new Reader().string("eventName").integer("winningTeamId"),
  "server.onRoundOverPlayers": new Reader().string("eventName").reader("players", playerListInfoReader),
  "server.onRoundOverTeamScores": new Reader().string("eventName").reader("scores", teamScoresReader),
};

//
// Class to represent the stream of buffers.
//
function Buffers() {
  var self = this;

  this.buffers = [];
  this.size = 0;

  this.join = function() {
    return Buffer.concat(self.buffers, self.size);
  };

  this.add = function(buffer) {
    self.buffers.push(buffer);
    self.size += buffer.length;
  };

  this.extractBuffer = function(size) {
    var bigBuffer = self.join();
    if (bigBuffer.size === size) {
      this.buffers = [];
      this.size = 0;
      return bigBuffer;
    }
    else {
      var packet = new Buffer(size);
      var dataLeft = new Buffer(bigBuffer.length - size);
      bigBuffer.copy(packet, 0, 0, size);
      bigBuffer.copy(dataLeft, 0, size, bigBuffer.length-1);

      this.buffers = [ dataLeft ];
      this.size = dataLeft.length;

      return packet;
    }
  };
}

//
// Collects incoming data and issues notifications with buffers ready
// to be decoded into packets
//
function PacketCollecter(socket) {
  var self = this;

  var packetHeaderSize = 12; // sequence, size, word count (3 * 4 bytes)

  this.socket = socket;
  this.buffers = new Buffers();
  this.expectedPacketSize = 0;
  this.listeners = [];

  this.socket.on("data", function(data) {
    self.newPacket(data);
  });

  this.newPacket = function(data) {
    //console.log("= Got new data with size", data.length);
    self.buffers.add(data);
    self.tryToReadPacket();
  };

  this.tryToReadPacket = function() {
    //console.log("= Current buffers size", self.buffers.size);
    if (self.expectedPacketSize === 0 && self.buffers.size >= 8) {
      self.expectedPacketSize = proto.readPacketSize(self.buffers.join());
      //console.log("Expected data size is", self.expectedPacketSize);
    }

    if (self.expectedPacketSize > 0 && self.buffers.size >= self.expectedPacketSize) {
      //console.log("Got whole packet...");
      var packetBuffer = self.buffers.extractBuffer(self.expectedPacketSize);
      self.expectedPacketSize = 0;
      self.notifyPacketRead(packetBuffer);

      //console.log("Trying to find next packet");
      self.tryToReadPacket();
    }
  };

  this.notifyPacketRead = function(packetBuffer) {
    self.listeners.forEach(function(callback) {
      setTimeout(callback.bind(null, packetBuffer), 0);
    });
  };

  this.addListener = function(callback) {
    if (typeof callback === "function") {
      this.listeners.push(callback);
    }
  };
}

//
// Decodes the incoming data. Issues notifications on server events.
// Allows to run server commands and specify callbacks
//
function Client() {
  var self = this;

  this.handlers = {};
  this.sequence = 0;
  this.sequenceData = {};

  this.packetCollecter = null;

  function extractPacketBuffer(size, buffer) {
    var packet = new Buffer(size);
    var dataLeft = new Buffer(buffer.length - size);
    buffer.copy(result, 0, 0, size);
    buffer.copy(leftover, 0, size, buffer.length - size);
    return {
      packet: packet,
      tail: dataLeft
    };
  }

  function decodeData(data) {
    var msg = proto.parseResponse(data);
    //console.log("Decoding", msg.words[0]);
    if (msg.isResponse && !msg.fromServer) {
      var seqData = self.sequenceData[msg.sequence];
      if (seqData) {
        var reader = READERS[seqData.command];
        if (reader && reader.read) {
          //console.log("Reading ", msg.words);
          msg = reader.read(msg.words);
        }
        if (seqData.callback) {
          seqData.callback(msg);
        }
        delete self.sequenceData[msg.sequence];
      }
    } else {
      var reader = READERS[msg.words[0]];
      if (!reader || !reader.read) {
        reader = serverEventReader;
      }
      var e = reader.read(msg.words);
      self.notifyHandlers("serverEvent", e);
      self.notifyHandlers(e.name, e);
    }
  }

  this.connect = function(host, port) {
    self.client = net.connect({host: host, port: port}, function() {
      // on connect
    });

    self.packetCollecter = new PacketCollecter(self.client);
    self.packetCollecter.addListener(decodeData);
  }

  this.sendCommand = function(command, callback) {
    if (command.length <= 0) {
      return false;
    }


    var seq = self.sequence;
    var args = [seq];
    var commandArgs = parse(command);
    for(var i=0; i < commandArgs.length; i++) {
      args.push(commandArgs[i]);
    }

    if (typeof callback === 'function') {
      self.sequenceData[seq] =  {
        command: commandArgs[0],
        callback: callback,
      };
    }


    var packet = proto.createRequest.apply(proto, args);
    self.client.write(packet);
    self.sequence += 1;
    return true;
  }

  this.on = function(eventName, handlerCallback) {
    if (!self.handlers[eventName]) {
      self.handlers[eventName] = [];
    }
    self.handlers[eventName].push(handlerCallback);
  };

  this.notifyHandlers = function(eventName /*, arguments... */) {
    var args = [];
    for(var i=1; i < arguments.length; i++) {
      args.push(arguments[i]);
    }

    var handlers = self.handlers[eventName];
    if (handlers && handlers.forEach) {
      handlers.forEach(function(callback) {
        callback.apply(null, args);
      });
    }
  }

}

exports.Client = Client;

