var numTickets = 100;
var numShards = 10;
var tickets = [];

var AppServerDelay = 1000;

var objectId = 0;

var Ticket = function Ticket(index) {
  this.index = index;
  this.id = "" + randomInteger() + objectId;
  this.available = true;
};

var Shard = function Shard() {
  this.tickets = [];
};

Shard.prototype.AddTicket = function AddTicket(ticket) {
  this.tickets.push(ticket);
};


Shard.prototype.GetTicketByIndex = function GetTicketByIndex(index) {
  return _.find(this.tickets, function(t){return t.index === index});
};

Shard.prototype.ClaimTicket = function ClaimTicket(ticket) {
  if(!ticket.available) throw new Error("Ticket already claimed");
  
  for(var i=0; i<this.tickets.length; i++) {
    if (this.tickets[i].id === ticket.id) {
      this.tickets[i].available = false;
      ractive.set('tickets['+ticket.index+'].available', false);
      console.log('claiming ticket: ', ticket);
      return;
    }
  }
  
  throw new Error("Could not find ticket in Shard");
};


var Database = function Database(numShards, whichShard) {
  this.shards = [];
  for(var i=0; i<numShards; i++) {
    this.shards[i] = new Shard();
  }
  
  this.whichShard = whichShard;
};

Database.prototype.AddTicket = function AddTicket(ticket) {
  var shard = this.shards[this.whichShard(ticket.index)]
  shard.AddTicket(ticket);
};

Database.prototype.GetTicketByIndex = function GetTicketByIndex(index) {
  var shard = this.shards[this.whichShard(index)];
  return shard.GetTicketByIndex(index);
};

Database.prototype.ClaimTicketByIndex = function ClaimTicketByIndex(index) {
  var shard = this.shards[this.whichShard(index)];
  var ticket = shard.GetTicketByIndex(index);
  if (_.isUndefined(ticket)) throw new Error("Cant claim undefined ticket");

  try {
    shard.ClaimTicket(ticket);
  } catch(e) {
    ractive.set('tickets['+ticket.index+'].attempted', true);
    setTimeout(function() {
      ractive.set('tickets['+ticket.index+'].attempted', false);
    }, 100);
    return e;
  }
}

function randomInteger() {
  return Math.floor(Math.random() * (200000 - 10000)) + 10000;
}

var AppServer = function AppServer(database, ticketClaimProcess) {
  this.database = database;
  this.ticketClaimProcess = ticketClaimProcess;
};

AppServer.prototype.Run = function Run() {
  console.log('Start app');
  var state = {
    finshed: false
  };
  
  this.Loop(this.ticketClaimProcess, this.database, state);
};

AppServer.prototype.Loop = function Loop(process, database, state) {
  console.log('loop');
  state = process(database, state);

  if (!state.finished) {
    setTimeout(function() {
      this.Loop(process, database, state);
    }.bind(this), AppServerDelay);
  }
};


var BasicTicketClaimProcess = function BasicTicketClaimProcess(database, state) {
  if (!state.initialized) {
    state = _.defaults(state, {
      i: 0,
      maxClaim: 10,
      initialized: true
    });
  }
  
  var error;
  if (state.i < state.maxClaim) {
    error = database.ClaimTicketByIndex(state.i);
    if (!_.isUndefined(error)) state.i += 1;
  } else {
    state.finished = true;
  }
  
  return state;
};

var ModulusShardIndex = function ModulusShardIndex(numShards, index) {
  return index%numShards;
}

var db = new Database(4, _.curry(ModulusShardIndex)(4));
var app01 = new AppServer(db, BasicTicketClaimProcess);

var t;
for(var z=0; z < numTickets; z++) {
  t = new Ticket(z);
  db.AddTicket(t);
  tickets.push(t);
}

//app01.Run();
