const Discord = require('discord.js');
const DiscoProxy = require('./src/disco_proxy');
const client = new Discord.Client();
const axios = require('axios');
const D = require('dumpjs');
const config = require('config');

const log4js = require("log4js");
log4js.configure({
  appenders: {
    console: { type: 'console' },
  },
  categories: { default: { appenders: ['console'], level: 'debug' } }
});
const logger = log4js.getLogger();

var { order_limits, order_attendees, fs } = restoreOrders();

client.once('ready', () => {
  logger.debug('This bot is online!');
})

client.on('message', message => {
  if( message.author.bot) return;
  
  console.log("channel: " + message.channel.name);
  if( !(
      message.channel.name === "受付" || 
      message.channel.name === "実行委員会" || 
      message.channel.name === "品川"
      )) return;


  const re1 = /大島さん/;
  if ( re1.test(message.content) ){
    message.reply('児島だよ');
  }
  const re2 = /児島さん/;
  if ( re2.test(message.content) ){
    message.reply('そうだよ');
  }

  //dumpCurrentStore(message);

  const re = /#(\d{10})([^\d]|$)/;
  if (( match_strings = re.exec(message.content)) !== null) {
    const eventbrite_order_id = match_strings[1];

    if ( isOverCommittedOnThisOrder(eventbrite_order_id, message)) {
      return;
    }
    
    axios.get('https://www.eventbriteapi.com/v3/orders/' 
          + eventbrite_order_id, 
            { headers: {
              Authorization: `Bearer ${config.eventbrite.privateKey}`,
            }
    })
    .then(function (response) {
      //dumpOrderStatus(eventbrite_order_id, response);

      if ( isForThisEvent(message, eventbrite_order_id, response) &&
          isValidOrderOnEventbrite(message, eventbrite_order_id, response)) {

        axios.get('https://www.eventbriteapi.com/v3/orders/' 
                  + eventbrite_order_id
                  + '/attendees/', 
                  { headers: {
                    Authorization: `Bearer ${config.eventbrite.privateKey}`,
                  }
        })
        .then(function (response) {
          dumpAttendeesOnThisOrder(response);
          addOrder(eventbrite_order_id, response, message);
          setDiscordRole(message);
          messageNumberOfUserOnThisOrder(message, eventbrite_order_id);
        })
        .catch(function (error) {
          logger.debug(error);
          messageNotFoundOnEventbrite(message, eventbrite_order_id, error);
        })    
      }
    })
    .catch(function (error) {
      logger.debug(error);
      messageNotFoundOnEventbrite(message, eventbrite_order_id, error);
    })
  }
})

client.login(config.discord.privateKey);


// for docker keep-alive in azure
const express = require('express')
const app = express()
const port = 8080

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  logger.debug(`http listening at http://localhost:${port}`)
})

function isValidOrderOnEventbrite(message, eventbrite_order_id, response) {
  if ( response.data.status === "placed" ) {
    const dp = new DiscoProxy(message);
    dp.messageValidOrderOnEventbrite(eventbrite_order_id);
    return true;
  } else {
    messageInvalidTicketStatusOnEventbrite(response, message, eventbrite_order_id);
    return false;
  }
}

function dumpAttendeesOnThisOrder(response) {
  logger.debug(D.dump(response.data.attendees));
}

function dumpOrderStatus(eventbrite_order_id, response) {
  logger.debug(eventbrite_order_id + ", " + response.status + ", " + response.data.name + ", " + response.data.status);
  logger.debug(D.dump(response.data));
  logger.debug("event_id: " + response.data.event_id);
}

function dumpCurrentStore(message) {
  logger.debug(message.content);
  logger.debug(message.author.username);

  logger.debug("order_limits: " + D.dump(order_limits));
  logger.debug("order_attendees: " + D.dump(order_attendees));
}

function isForThisEvent(message, eventbrite_order_id, response) {
  if ( response.data.event_id == config.eventbrite.eventId ) {
    return true;
  } else {
    const dp = new DiscoProxy(message);
    dp.messageNotForThisEvent(eventbrite_order_id);
    return false;
  }
}

function isOverCommittedOnThisOrder(eventbrite_order_id, message) {
  if ( order_attendees[eventbrite_order_id] === undefined) { 
    message.reply(eventbrite_order_id + "は初めての問い合わせです。");
    return false;
  }
  if ( order_attendees[eventbrite_order_id].has(message.author.username)) {
    message.reply(eventbrite_order_id + "で" + message.author.username + "さんは前に処理した記録がありますが、念のためもう一回確認しますね。");
    return false;
  }
  if ( order_attendees[eventbrite_order_id].size < order_limits[eventbrite_order_id] ) {
    messageNumberOfUserOnThisOrder(message, eventbrite_order_id);
    return false;
  }

  messageOverCommittedOnThisOrder(message);
  return true;
}

function messageNumberOfUserOnThisOrder(message, eventbrite_order_id) {
 
  if (order_attendees[eventbrite_order_id] ) {
    message.reply(eventbrite_order_id + "は"
    + order_limits[eventbrite_order_id] + "名分のうち、"
    + order_attendees[eventbrite_order_id].size + "名が登録済みです。");
  } else {
    message.reply(eventbrite_order_id + "は初めての登録です。");
  }
}

function messageOverCommittedOnThisOrder(message) {
  message.reply("あら、登録可能な人数を超えてしまいますので、スタッフが確認いたします。少々お待ちください。");
}

function messageInvalidTicketStatusOnEventbrite(response, message, eventbrite_order_id) {
  if (typeof (response.data.status) == "string") {
    message.reply(eventbrite_order_id + "は現在、有効ではありません。 status=" + response.data.status);
  } else {
    message.reply(eventbrite_order_id + "は現在、有効ではありません。");
  }
}

function messageNotFoundOnEventbrite(message, eventbrite_order_id, error) {
  message.reply("あら、" + eventbrite_order_id + "はEventbrite上に見当たりませんでした。10桁のOrder番号をご確認ください。(" + error.response.status + ")");
}

function setDiscordRole(message) {
  const role = message.guild.roles.cache.find(role => role.name === config.discord.roleForValidUser);
  if (role) {
    if (message.member.roles.cache.some(role => role.name === config.discord.roleForValidUser)) {
      logger.info("すでに" + role.name + "のロールをお持ちでした！");
      message.reply("すでに" + role.name + "のロールをお持ちでした！");
    } else {
      message.member.roles.add(role);
      logger.info(role.name + "のロールをつけました！");
      message.reply(role.name + "のロールをつけました！");
    }
  } else {
    logger.info(config.discord.roleForValidUser + "のロールがサーバー上に見つかりませんでした");
    message.reply(config.discord.roleForValidUser + "のロールがサーバー上に見つかりませんでした");
  }
}

function addOrder(eventbrite_order_id, response, message) {
  fs.appendFileSync(config.data.filePath, "\r\n" + eventbrite_order_id + ", " + response.data.attendees.length + ", " + message.author.username);
  if (order_attendees[eventbrite_order_id] == undefined) {
    order_attendees[eventbrite_order_id] = new Set();
  }
  order_attendees[eventbrite_order_id].add(message.author.username);
  order_limits[eventbrite_order_id] = response.data.attendees.length;
}

function restoreOrders() {
  const fs = require('fs');
  let order_limits = {};
  let order_attendees = {};
  logger.debug("dataFilePath: " + config.data.filePath);
  fs.readFile(config.data.filePath, 'utf8', (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        logger.debug('File not found!');
        return;
      } else {
        throw err;
      }
    }
    //logger.debug(data);
    data.split('\r\n').forEach(line => {
      if (line != "") {
        const order = line.split(', ');
        //logger.debug(D.dump(order));
        const eventbrite_order_id = order[0].toString();
        if (order_attendees[eventbrite_order_id] == undefined) {
          order_limits[eventbrite_order_id] = order[1];
          order_attendees[eventbrite_order_id] = new Set();
          order_attendees[eventbrite_order_id].add(order[2]);
        } else {
          order_attendees[eventbrite_order_id].add(order[2]);
        }
      }
    });
  });
  return { order_limits, order_attendees, fs };
}
