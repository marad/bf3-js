
//
// Serializer
//
function Serializer() {
  var self = this;

  this.wordSize = function(word) {
    return word.length + 5; // word length + uint32 (4 bytes) + zero termination
  }

  this.packetSize = function(packet) {
    return 12 + packet.words.map(self.wordSize.bind(self)).reduce(function(a, b) { return a+b })
  }

  this.serializeWord = function(word, buffer, position) {
    buffer.writeUInt32LE(word.length, position);
    buffer.write(word, position+4, word.length, 'ascii');
    buffer.writeUInt8(0, position+4+word.length);
    return self.wordSize(word);
  }

  this.serializePacket = function(packet, buffer, position) {
    var size = self.packetSize(packet);
    buffer.writeUInt32LE(packet.sequence, position);
    buffer.writeUInt32LE(size, position+4);
    buffer.writeUInt32LE(packet.words.length, position+8);
    var currentPosition = position+12;
    packet.words.forEach(function(word) {
      currentPosition += self.serializeWord(word, buffer, currentPosition);
    });
    return size;
  }

  this.createSequence = function(fromServer, response, sequence) {
    var value = sequence & 0x3fffffff;
    if (fromServer) {
      value += 0x80000000;
    }

    if (response) {
      value += 0x40000000;
    }
    return value;
  }
}

//
// Parser
//
function Parser() {
  var self = this;
  var wnum = 1;

  this.parseWord = function(buffer, position) {
    wnum += 1;
    if (buffer.length <= position) {
      return [null, 0];
    }

    var len = buffer.readUInt32LE(position);
    var value = buffer.toString('ascii', position+4, position+4+len);
    return [ value, 4+len+1 ];
  }

  this.extractHeader = function(buffer, object) {
    var position = 0;
    var encodedSequence = buffer.readUInt32LE(position);
    object.fromServer = (encodedSequence >> 31) & 0x01;
    object.isResponse = (encodedSequence >> 30) & 0x01;
    object.sequence = encodedSequence & 0x3fffffff;
    object.size = buffer.readUInt32LE(position+4);
  }

  this.parsePacket = function(buffer) {
    wnum =1;
    var result = {};
    self.extractHeader(buffer, result);
    var wordCount = buffer.readUInt32LE(8);
    var currentPosition = 12;
    result.words = [];
    for(var i=0; i < wordCount; i++) {
      var wordResult = self.parseWord(buffer, currentPosition);
      if (wordResult[0] !== null) {
        result.words.push(wordResult[0]);
        currentPosition += wordResult[1];
      }
    }
    return result;
  }
}

var serializer = new Serializer();
var parser = new Parser();

//
// Exports
//

exports.readPacketSize = function(buffer) {
  return buffer.readUInt32LE(4);
}

exports.createRequest = function(sequence) {
  var words = [];
  for(var i = 1; i < arguments.length; i++) {
    words.push( arguments[i].toString() );
  }

  var packet = {
    sequence: serializer.createSequence(false, false, sequence),
    words: words
  };

  var size = serializer.packetSize(packet);
  var buffer = new Buffer(size);
  serializer.serializePacket(packet, buffer, 0);
  return buffer;

}

exports.parseResponse = function(data) {
  return parser.parsePacket(data);
}

