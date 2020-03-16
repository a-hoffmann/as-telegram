//Using the TIE API

const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const TIE = require('@artificialsolutions/tie-api-client');
const {
  TENEO_ENGINE_URL,
  WEBHOOK_FOR_TELEGRAM,
  TELEGRAM_TOKEN,
  PORT
} = process.env;
const port = PORT || 8443;
const token = TELEGRAM_TOKEN;
const teneoApi = TIE.init(TENEO_ENGINE_URL);

// initialise session handler, to store mapping between telegram id and engine session id
const sessionHandler = SessionHandler();

//initialise Telegram Bot
const bot = new TelegramBot(token);

// initialize an Express application
const app = express();


//TODO: read up on routers, for now old method will work
/*
var router = express.Router()

// Tell express to use this router with /api before.
app.use("/", router);

router.post("/", handleTelegramMessages(sessionHandler));
*/

bot.setWebHook(`${WEBHOOK_FOR_TELEGRAM}/bot${token}`); 


// parse the updates to JSON
app.use(bodyParser.json());

//recieving updates at the route below
//TODO: check what processUpdate does
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Start Express Server
app.listen(port, () => {
  console.log(`Express server is listening on ${port}`);
});


bot.on('message', (msg) => {
	handleTelegramMessage(sessionHandler,msg)
});

async function handleTelegramMessage(sessionHandler, message) {

  try {
	  console.log(`entire message ${message}`);
    console.log(`Got message '${message.text}' from chat ID ${message.chat.id}`);

    // find engine session id mapped to chat id
    const sessionId = await sessionHandler.getSession(message.chat.id);

    // send message to engine using sessionId
    const teneoResponse = await teneoApi.sendInput(sessionId, {
      text: message.text,
	  channel: 'telegram'
    });

    console.log(`Got Teneo Engine response '${teneoResponse.output.text}' for session ${teneoResponse.sessionId}`);

    // store mapping between chat ID and engine sessionId
    await sessionHandler.setSession(message.chat.id, teneoResponse.sessionId);

    // construct telegram message using the response from engine
    const telegramMessage = createTelegramMessage(teneoResponse);

    // send message to slack with engine output text
    await sendTelegramMessage(message.chat.id, telegramMessage);

  } catch (error) {
    console.error(`Failed when sending input to Teneo Engine @ ${TENEO_ENGINE_URL}`, error);
  }

}

// create bot response
function createTelegramMessage(teneoResponse) {

  // your bot can use output parameters to populate attachments
  // you would find those in teneoResponse.output.parameters
  const message = {};

  // populate base message
  message.text = teneoResponse.output.text;

  // check for attachment TODO
  if (teneoResponse.output.parameters.telegram) {
    try {
      message.attachments = [JSON.parse(teneoResponse.output.parameters.telegram)];
    } catch (error_attach) {
      console.error(`Failed when parsing attachment JSON`, error_attach);
    }
  }
  return message
}

// send the response back
function sendTelegramMessage(userId, messageData) {
	//expects of the old form (msg.chat.id, engineResponse.answer)
  bot.sendMessage(userId, messageData.text)
    .catch(console.error);
}

/***
 * SESSION HANDLER
 ***/

function SessionHandler() {

  var sessionMap = new Map();

  return {
    getSession: (userId) => {
      if (sessionMap.size > 0) {
        return sessionMap.get(userId);
      }
      else {
        return "";
      }
    },
    setSession: (userId, sessionId) => {
      sessionMap.set(userId, sessionId)
    }
  };
}