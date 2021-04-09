// Librerías
const dialogflow = require("dialogflow");
var fs = require("fs");


//Inicializaciones
// Telegram Bot
const TelegramBot = require('node-telegram-bot-api');
const tokenTelegram = '';
// Método para recoger los actualizaciones de Telegram
// Método 1: Polling
const bot = new TelegramBot(token, {polling: true});

// Fin Método 1
// Método 2: Webhook
/*
const url = 'https://4b4a96b8b157.ngrok.io';
const express = require('express');
const bot = new TelegramBot(tokenTelegram);
bot.setWebHook(`${url}/bot${tokenTelegram}`);
const port = 3000;
const app = express();
// parse the updates to JSON
app.use(express.json());
app.post(`/bot${tokenTelegram}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});
//const port = process.env.PORT;
app.listen(port, () => {
  console.log(`Express server is listening on ${port}`);
});
*/
// Fin Método 2


// Dialogflow
const credentials = {
    keyFilename: "./dev/service_account.json"
  };
const sessionClient = new dialogflow.SessionsClient(credentials);
const contextsClient = new dialogflow.ContextsClient(credentials);
const projectId = "";

// Google Spreedsheet
const SPREADSHEET_ID = "";


async function vision_artificial(url_image) {
    return new Promise((resolve, reject)=>{ 
    const vision = require('@google-cloud/vision');
    // Creates a client
    const client = new vision.ImageAnnotatorClient(credentials);
    // Performs label detection on the image file
    //const [result] = await client.labelDetection(url_image);
    //client.labelDetection(url_image).then(([result]) =>{
    client.objectLocalization(url_image).then(([result]) =>{
      console.log(result);
      const labels = result.localizedObjectAnnotations;
      //console.log('Labels:');
      //labels.forEach(label => console.log(label.description));
      resolve(labels)
    })
  })
}

// Listen for any kind of message. There are different kinds of
// messages.
bot.on('message', async (msg) => {

  console.log("-> Mensaje recibido en Telegram: "+JSON.stringify(msg));
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const sessionId = userId.toString();//msg.from.id.toString();
  const sessionPath = sessionClient.sessionPath(projectId, sessionId); 
  //console.log("sessionPath: "+sessionPath);
  let userData;
  /**** Comprobamos si el usuario ya existía *********/
  userData = await consultaUsuario(userId);
  console.log("userData: "+JSON.stringify(userData))
  //Si hay datos de usuario almacenados en nuestra BBDD creo el contexto datos_usuario
  if(userData.nombre){ //Si el objeto no está vacío

    const contextPath = contextsClient.contextPath(projectId,sessionId,'datos_usuario');
    var createContextRequest = {
        parent: sessionPath,
        context: {
          name: contextPath,
          lifespanCount: 100,
          parameters: {
            fields: {
              nombre: {
                kind: "stringValue",
                stringValue: userData.nombre
              },
              pais: {
                kind: "stringValue",
                stringValue: userData.pais
              }
            }
          }
          
        }
      }
    const a = await contextsClient.createContext(createContextRequest);
  }
  /***************************************************/
  
  // Texto
  if (msg.text) {
    var request_dialogflow = {
        session: sessionPath,
        queryInput: {
            text: {
            text: msg.text,
            languageCode: "es-ES"
            }
        }
    };
    console.log(JSON.stringify("request: "+request_dialogflow));
    const responses = await sessionClient.detectIntent(request_dialogflow);
    gestionaMensajesDF(responses, chatId);  
  } 
  // Ubicación
  else if (msg.location) { 
    var request_dialogflow = {
      session: sessionPath,
      queryInput: {
          text: {
          text: 'ubicacion',
          languageCode: "es-ES"
          }
      }
    };
    const responses = await sessionClient.detectIntent(request_dialogflow);
    gestionaMensajesDF(responses, chatId);  
    let data_recomendador = {
      id_usuario: chatId,
      nombre: msg.from.first_name,
      idioma: msg.from.language_code,
      longitud: msg.location.longitude,
      latitud: msg.location.latitude
    }
    console.log("----------> "+JSON.stringify(responses[0].queryResult.parameters))
    if (responses[0].queryResult.parameters && responses[0].queryResult.parameters.fields.edad){
      data_recomendador.edad = responses[0].queryResult.parameters.fields.edad.numberValue
    }
    ingestaDatosRecomendador(data_recomendador);
  } 
  // Imagen
  else if (msg.photo) { 
    console.log(JSON.stringify(msg.photo))
    // Hacemos un bucle porque en telegram móvil llegan 3 versiones de la foto. Nos quedamos con la que más resolución tenga 
    var photo_index_max_resolution = 0;
    var max_resolution = 0;
    for (var i = 0; i < msg.photo.length; i++) {
      if (max_resolution < msg.photo[i].height * msg.photo[i].width){
        photo_index_max_resolution = i
        max_resolution = msg.photo[i].height * msg.photo[i].width
      }
    } 
    console.log(`Resolucion: ${msg.photo[photo_index_max_resolution].height}x${msg.photo[photo_index_max_resolution].width}`)
    const image_url = await bot.downloadFile(msg.photo[photo_index_max_resolution].file_id, "./");
    const labels = await vision_artificial(image_url);  
    
    for (var i = 0; i < labels.length; i++) {
      const contextPath = contextsClient.contextPath(projectId,sessionId,labels[i].name.toLowerCase());
      var createContextRequest = {
          parent: sessionPath,
          context: {
            name: contextPath,
            lifespanCount: 2,
            
          }
        }
      const a = await contextsClient.createContext(createContextRequest);
  }

    var request_dialogflow = {
        session: sessionPath,
        queryInput: {
            text: {
            text: 'foto',
            languageCode: "es-ES"
            }
        }
    };
    const responses = await sessionClient.detectIntent(request_dialogflow);
    gestionaMensajesDF(responses, chatId);  
    
  }

  
  
});

bot.on("callback_query", async function(data){
  console.log("-> Callback recibido en Telegram: "+JSON.stringify(data));
  const userId = data.from.id;
  const chatId = userId;
  const sessionId = userId.toString();//msg.from.id.toString();
  const sessionPath = sessionClient.sessionPath(projectId, sessionId);
  // Texto
  var request_dialogflow = {
      session: sessionPath,
      queryInput: {
          text: {
          text: data.data,
          languageCode: "es-ES"
          }
      }
  }
  const responses = await sessionClient.detectIntent(request_dialogflow);
  gestionaMensajesDF(responses, chatId);
});

async function gestionaMensajesDF(responses, chatId){
  var mensajes = responses[0].queryResult.fulfillmentMessages;
  console.log("-> Respuesta de DF: "+JSON.stringify(mensajes));
  let mensajesEspecificosTelegram = false;
  for (var i = 0; i < mensajes.length; i++) {
    if (mensajes[i].platform === 'TELEGRAM') {
      mensajesEspecificosTelegram = true;
      // Cards
      if (mensajes[i].message === 'card') {
        //if (mensajes[i].card.title) await bot.sendMessage(chatId, mensajes[i].card.title)
        if (mensajes[i].card.imageUri) await bot.sendPhoto(chatId, mensajes[i].card.imageUri);
        if (mensajes[i].card.buttons) {
          const btns = mensajes[i].card.buttons;
          let botones_TE = {
            reply_markup: {
                inline_keyboard: []
            }
          }
          for (var j = 0; j < btns.length; j++) {
            botones_TE.reply_markup.inline_keyboard.push([{"text":btns[j].text,"callback_data":btns[j].text}])
          }
          await bot.sendMessage(chatId, mensajes[i].card.title, botones_TE)
        }
      } 
      // Text
      else if (mensajes[i].message === 'text'){
        await bot.sendMessage(chatId, mensajes[i].text.text[0]);
      } 
      // quickReplies
      else if (mensajes[i].message === 'quickReplies'){
        let botones_TE = {
          reply_markup: {
              inline_keyboard: []
          }
        }
        // Insertamos los botones en el mensaje para Telegram
        var botones_DF = mensajes[i].quickReplies.quickReplies;
        for (var j = 0; j < botones_DF.length; j++) {
          botones_TE.reply_markup.inline_keyboard.push([{"text":botones_DF[j],"callback_data":botones_DF[j]}])
        }
        await bot.sendMessage(chatId, mensajes[i].quickReplies.title, botones_TE)
      } 
      // Imagen
      else if (mensajes[i].message === 'image'){
        await bot.sendPhoto(chatId, mensajes[i].image.imageUri);
      } 
    }
    if (mensajes[i].platform === 'PLATFORM_UNSPECIFIED' && !mensajesEspecificosTelegram) {
      await bot.sendMessage(chatId, mensajes[i].text.text[0]);
    }
  }
}

async function consultaUsuario(userId){
  let data = {}
  const {GoogleSpreadsheet} = require('google-spreadsheet')
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  const cred = require('./dev/service_account.json')
  await doc.useServiceAccountAuth(cred);
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0]; // número de hoja. Si solo hay una hoja es la 0
  const rows = await sheet.getRows();
  for (var k = 0; k < rows.length; k++) {
    if(rows[k].userId.toString() === userId.toString()){ // Existe ese sessionId
      data.userId = userId;
      data.nombre = rows[k].nombre;
      data.pais = rows[k].pais;
      
    }
  }
  return(data)
}
