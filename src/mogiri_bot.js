const config = require('config');
const MogiriBase = require('./mogiri_base')
const {logger} = require('./logger')
const {dumpAttendeesOnThisOrder} = require('./matsumoto')
const {TicketWarehouse} = require('./ticket_man')

const DATA_PATH = './data/test_data'
const EVENT_ID = config.eventbrite.eventId

const warehouse = new TicketWarehouse(DATA_PATH, EVENT_ID)

class MogiriBot extends MogiriBase {
  /**
   * @param {String} content
   */
  async commit(content) {
    const match_strings = /#(\d{10})([^\d]|$)/.exec(content)
    match_strings && await this.run(match_strings[1])
  }

  async run(ticket) {
    const message = this.message
    const eb_ticket = warehouse.getEbTicket(ticket)

    if (!eb_ticket) {
      message.reply(`${ticket}は初めての問い合わせです。`);
    } else {
      if(eb_ticket.isFull) {
        message.reply('あら、登録可能な人数を超えてしまいますので、スタッフが確認いたします。少々お待ちください。');
        return;
      }
    }

    if (eb_ticket.isRegisterd(message.author.username)) {
      message.reply(`${ticket} で ${message.author.username} さんは前に処理した記録がありますが、念のためもう一回確認しますね。`);
    } else {
      //MEMO: 同じチケット番号で二人目の登録のケース
      message.reply(`${ticket} は初めての登録です。`);
    }
  
    message.reply(eb_ticket.info);

    try {
      //MEMO: アンダーコミットの時に eventbrite に問い合わせてしまう
      const eb_ticket = await EbTicket.reference(ticket)
      message.reply(`${ticket}は有効なEventbriteオーダー番号です。`)

      dumpAttendeesOnThisOrder(response);
      eb_ticket.addAttendance(message.author.username);
      warehouse.addEbTicket(eb_ticket);
      setDiscordRole(message);
      message.reply(eb_ticket.info);
    } catch (error) {
      logger.debug(error);
      message.reply(error.message);
    }
  }
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


module.exports = MogiriBot;
